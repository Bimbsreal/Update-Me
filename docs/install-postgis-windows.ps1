# Install PostGIS 3.6.2 into local PostgreSQL 18 (requires Administrator)
# Bundle is expected at: %TEMP%\postgis-pg18\postgis-bundle-pg18-3.6.2x64
# Download from: https://download.osgeo.org/postgis/windows/pg18/

$ErrorActionPreference = 'Stop'
$src = Join-Path $env:TEMP 'postgis-pg18\postgis-bundle-pg18-3.6.2x64'
$pg = 'C:\Program Files\PostgreSQL\18'

if (-not (Test-Path $src)) {
  Write-Error "PostGIS bundle not found at $src. Download and extract first."
}

Write-Host "Copying PostGIS into $pg ..."
Copy-Item "$src\bin\*" "$pg\bin\" -Force
Copy-Item "$src\lib\*" "$pg\lib\" -Force
Copy-Item "$src\share\extension\*" "$pg\share\extension\" -Force
if (Test-Path "$src\share\contrib") {
  New-Item -ItemType Directory -Force -Path "$pg\share\contrib" | Out-Null
  Copy-Item "$src\share\contrib\*" "$pg\share\contrib\" -Recurse -Force
}
New-Item -ItemType Directory -Force -Path "$pg\gdal-data" | Out-Null
Copy-Item "$src\gdal-data\*" "$pg\gdal-data\" -Recurse -Force

Write-Host "Done. Restart PostgreSQL if needed, then:"
Write-Host "  psql -U postgres -d update_me -c `"CREATE EXTENSION postgis;`""
Write-Host "  cd backend && npm run migrate"
