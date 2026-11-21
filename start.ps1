$env:PATH = "C:\Users\Lenovo\AppData\Local\ms-playwright-go\1.57.0;" + $env:PATH
Write-Host "Starting NBFC Eligibility Portal..." -ForegroundColor Green
Write-Host "Open http://localhost:3000 in your browser." -ForegroundColor Cyan
Set-Location -Path $PSScriptRoot
node server.js
