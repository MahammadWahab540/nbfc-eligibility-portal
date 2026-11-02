const fs = require('fs');

async function testApi() {
  const payload = JSON.parse(fs.readFileSync('test_payload.json', 'utf8'));
  const res = await fetch('http://localhost:3000/api/v1/eligibility/evaluate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
}

testApi().catch(err => {
  console.error('API Error:', err);
  process.exit(1);
});
