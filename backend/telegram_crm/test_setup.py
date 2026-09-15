import io
import json
from unittest.mock import patch
from django.test import TestCase, override_settings
from django.core.cache import cache
from rest_framework.test import APIClient
from salon.models import User, AdminActionLog
from .models import IntegrationSettings, Connection
from .integration import runtime
from .services import configured, issue_link
from .worker import run_batch

@override_settings(DEBUG=True, TELEGRAM_ENABLED=False, TELEGRAM_BOT_TOKEN='', TELEGRAM_BOT_USERNAME='', TELEGRAM_INTEGRATION_SECRET='', TELEGRAM_DRY_RUN=True)
class SetupTests(TestCase):
    token='123456:'+'a'*35
    secret='integration-fixture-'+'x'*35

    def setUp(self):
        cache.clear()
        self.admin=User.objects.create_user(username='setup-admin',role='admin')
        self.customer=User.objects.create_user(username='setup-customer',role='customer')
        self.client=APIClient();self.client.force_authenticate(self.admin)

    def save(self,**changes):
        row=IntegrationSettings.objects.filter(pk=1).first()
        return self.client.patch('/api/v1/telegram/admin/setup/',{'revision':row.revision if row else 0,**changes},format='json')

    def provision(self):
        return self.save(token=self.token,integration_secret=self.secret,bot_username='https://t.me/SalonFixtureBot',site_url='https://salon.example',backend_url='https://backend.example')

    def verify(self,username='SalonFixtureBot',bot_id=123456):
        cache.clear()
        response=io.BytesIO(json.dumps({'ok':True,'result':{'id':bot_id,'is_bot':True,'username':username}}).encode())
        with patch('telegram_crm.integration.urlopen',return_value=response) as call:
            result=self.client.post('/api/v1/telegram/admin/setup/',{'action':'verify'},format='json')
            if call.called:self.assertTrue(call.call_args.args[0].full_url.endswith('/getMe'))
            return result

    def test_admin_only_including_inactive_accounts(self):
        for user in [None,self.customer]:
            self.client.force_authenticate(user)
            self.assertIn(self.client.get('/api/v1/telegram/admin/setup/').status_code,[401,403])
            self.assertIn(self.save(token=self.token).status_code,[401,403])
        self.admin.is_active=False;self.admin.save();self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.get('/api/v1/telegram/admin/setup/').status_code,403)

    def test_encrypted_write_only_credentials_and_blank_preservation(self):
        response=self.provision();self.assertEqual(response.status_code,200,response.data)
        self.assertEqual(response.data['mode'],'off')
        row=IntegrationSettings.objects.get()
        self.assertNotIn(self.token,row.token_ciphertext);self.assertNotIn(self.secret,row.secret_ciphertext)
        self.assertEqual(runtime().bot_token,self.token);self.assertEqual(runtime().integration_secret,self.secret)
        self.assertEqual(self.save(token='',integration_secret='').status_code,200)
        self.assertEqual(runtime().bot_token,self.token)
        for data in [response.data,self.client.get('/api/v1/telegram/admin/setup/').data,list(AdminActionLog.objects.values('details'))]:
            self.assertNotIn(self.token,str(data));self.assertNotIn(self.secret,str(data))
        self.assertEqual(response['Cache-Control'],'no-store')

    def test_verification_explicit_live_activation_and_stop(self):
        self.provision();self.assertEqual(self.save(mode='live',confirm_live=True).status_code,400)
        self.assertEqual(self.verify().status_code,200)
        self.assertEqual(self.save(mode='live').status_code,400)
        with patch('telegram_crm.transport.TelegramTransport.send') as send:
            self.assertEqual(self.save(mode='live',confirm_live=True).status_code,200)
            self.assertTrue(configured());self.assertFalse(runtime().dry_run);send.assert_not_called()
            self.assertEqual(self.save(mode='off').status_code,200)
            self.assertFalse(configured());run_batch(generate=False);send.assert_not_called()

    def test_panel_runtime_link_and_emergency_stop(self):
        self.provision();self.save(mode='test')
        c=Connection.objects.create(scope=f'account:{self.customer.pk}',user=self.customer)
        self.assertIn('https://t.me/SalonFixtureBot?start=',issue_link(c)['url'])
        self.assertTrue(configured());self.assertTrue(runtime().dry_run)
        self.assertEqual(runtime().site_url,'https://salon.example')
        with override_settings(TELEGRAM_FORCE_DISABLED=True):self.assertFalse(configured())

    def test_token_change_pauses_and_requires_reverification(self):
        self.provision();self.verify();self.save(mode='live',confirm_live=True)
        response=self.save(token='123456:'+'b'*35)
        self.assertEqual(response.status_code,200);self.assertEqual(response.data['mode'],'off');self.assertIsNone(response.data['verified_at'])
        self.assertEqual(self.save(mode='live',confirm_live=True).status_code,400)

    def test_no_silent_bot_transfer(self):
        self.provision();self.verify()
        Connection.objects.create(scope=f'account:{self.customer.pk}',user=self.customer,connected=True,chat_id=123,telegram_user_id=123)
        self.assertEqual(self.save(bot_username='DifferentBot').status_code,400)
        self.save(token='7654321:'+'b'*35)
        self.assertEqual(self.verify('DifferentBot',7654321).status_code,400)

    def test_key_loss_validation_and_https(self):
        self.provision();self.save(mode='test')
        with override_settings(SECRET_KEY='different-server-key'):
            self.assertFalse(configured())
            self.assertFalse(self.client.get('/api/v1/telegram/admin/setup/').data['credentials_readable'])
        for data in [{'token':'bad-secret-value'},{'integration_secret':'short-secret'},{'backend_url':'https://example.com/path'},{'site_url':'https://user:password@example.com'}]:
            response=self.save(**data);self.assertEqual(response.status_code,400)
            self.assertNotIn(next(iter(data.values())),str(response.data))
        with override_settings(DEBUG=False):self.assertEqual(self.save(token=self.token).status_code,403)

    def test_stale_editor_and_sanitized_verification_failure(self):
        self.provision()
        response=self.client.patch('/api/v1/telegram/admin/setup/',{'revision':0,'mode':'test'},format='json')
        self.assertEqual(response.status_code,400)
        with patch('telegram_crm.integration.urlopen',side_effect=OSError('private-token-in-provider-error')):
            response=self.client.post('/api/v1/telegram/admin/setup/',{'action':'verify'},format='json')
        self.assertEqual(response.status_code,400);self.assertNotIn('private-token',str(response.data))
        self.assertIsNone(IntegrationSettings.objects.get().verified_at)
