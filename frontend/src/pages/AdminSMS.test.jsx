import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AdminSMS from './AdminSMS';
import { api } from '../shared/api';

vi.mock('../shared/api',()=>({api:{get:vi.fn(),post:vi.fn(),patch:vi.fn()},toman:v=>`${v} تومان`}));
const report={total:0,pending:0,sent:0,delivered:0,failed:0,unknown:0,success_rate:0};
const campaign={id:1,name:'بازگشت مشتری',message:'سلام {{first_name}}',segment:{},status:'draft',report};
const config={settings:{salon_name:'بهارناژ',booking_link:'',manager_phone:'',daily_summary_enabled:false,daily_summary_hour:21,campaign_summary_enabled:false,failure_alert_enabled:false,batch_size:50,last_worker_at:null},provider:{configured:false,development:false,message:'ارائه‌دهنده پیامک پیکربندی نشده است.'}};
beforeEach(()=>{vi.clearAllMocks();api.get.mockImplementation(path=>Promise.resolve({data:path.endsWith('settings/') ? config : path.endsWith('campaigns/') ? [campaign] : []}));});

describe('SMS CRM',()=>{
  it('shows unconfigured provider and server worker state honestly',async()=>{
    render(<AdminSMS/>);
    expect(await screen.findByText('ارائه‌دهنده پیامک پیکربندی نشده است.')).toBeInTheDocument();
    expect(screen.getByText(/پردازشگر فعال گزارش نشده/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'آزمایش و جزئیات'}));
    expect(screen.getByRole('button',{name:'ارسال آزمایشی'})).toBeDisabled();
  });
  it('requires recipient preview before campaign confirmation',async()=>{
    api.get.mockImplementation(path=>Promise.resolve({data:path.endsWith('settings/') ? {...config,provider:{configured:true,message:'متصل'}} : path.endsWith('campaigns/') ? [campaign] : []}));
    api.post.mockResolvedValue({data:{recipient_count:2,total_parts:6,audience:[{customer:1,name:'مینا',phone:'09111111111',message:'سلام مینا',parts:3}],confirmation_token:'reviewed'}});
    render(<AdminSMS/>);
    fireEvent.click(await screen.findByRole('button',{name:'بررسی و ارسال'}));
    expect(await screen.findByRole('dialog',{name:'تأیید ارسال کمپین'})).toBeInTheDocument();
    expect(screen.getByText('2 مخاطب')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'تأیید و ارسال'}));
    await waitFor(()=>expect(api.post).toHaveBeenCalledWith('admin/sms/campaigns/1/confirm/',{confirmation_token:'reviewed',scheduled_at:null}));
  });
  it('saves a draft with structured audience filters',async()=>{
    api.post.mockResolvedValue({data:campaign});
    render(<AdminSMS/>);
    fireEvent.click(screen.getByRole('button',{name:'کمپین جدید'}));
    fireEvent.change(screen.getByLabelText('نام کمپین'),{target:{value:'مشتریان قدیمی'}});
    fireEvent.change(screen.getByLabelText('متن پیام'),{target:{value:'سلام {{first_name}}'}});
    fireEvent.change(screen.getByLabelText('عدم مراجعه بیش از (روز)'),{target:{value:'90'}});
    fireEvent.click(screen.getByRole('button',{name:'ذخیره پیش‌نویس'}));
    await waitFor(()=>expect(api.post).toHaveBeenCalledWith('admin/sms/campaigns/',expect.objectContaining({segment:{inactive_days:90},service:null})));
  });
  it('separates appointment reminders from loyalty rules',async()=>{
    render(<AdminSMS/>);
    fireEvent.click(screen.getByRole('button',{name:'پیامک‌های خودکار'}));
    fireEvent.click(screen.getByRole('button',{name:'قانون جدید'}));
    expect(screen.getByLabelText('نوع پیام')).toHaveValue('appointment_reminder');
    expect(screen.getByLabelText('چند ساعت پیش از نوبت')).toHaveValue(24);
    expect(screen.queryByRole('option',{name:'تولد'})).not.toBeInTheDocument();
  });
});
