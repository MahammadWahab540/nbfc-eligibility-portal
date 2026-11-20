const http = require('http');

const payload = JSON.stringify({
  userId: 'test-cnrb',
  'Academy PRE -Loan Journey Name': 'Test User',
  'Choose NBFC': 'GYANDHAN',
  'CIBIL Score Range': '700 - 900',
  'Relation with the Co-Applicant': 'Father',
  'Co applicant Occupation': 'Businessperson',
  'Co-Applicant Age': '45',
  'State': 'Maharashtra',
  'Co-Applicant Monthly Income': '40000',
  "Co-Applicant's Bank Name": 'CNRB'
});

const req = http.request('http://localhost:3000/api/evaluate', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload)
  }
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('Status Code:', res.statusCode);
    const parsed = JSON.parse(data);
    console.log('Eligible:', parsed.eligible_nbfcs.map(e => e.partner_name));
    console.log('Conditional:', parsed.conditional_nbfcs.map(c => c.partner_name));
    console.log('Ineligible:', parsed.ineligible_nbfcs.map(i => i.partner_name));
  });
});

req.on('error', err => console.error('Error:', err.message));
req.write(payload);
req.end();
