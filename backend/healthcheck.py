"""Read-only readiness check using the public catalog and standard library."""
from urllib.request import Request, urlopen

request = Request("http://127.0.0.1:8000/api/v1/services/", headers={
    "Host": "baharnaj.ir", "X-Forwarded-Proto": "https",
})
with urlopen(request, timeout=4) as response:
    assert response.status == 200
