Write-Host "Starting NBFC Eligibility Portal..." -ForegroundColor Green
Write-Host "Open http://localhost:3000 in your browser." -ForegroundColor Cyan
Set-Location -Path $PSScriptRoot
node server.js
