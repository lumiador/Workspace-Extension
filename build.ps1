# Build script for Firefox Workspaces extension
# Creates workspaces.xpi with proper forward slashes for AMO

$ErrorActionPreference = "Stop"

# Load required .NET assemblies explicitly
try {
    Add-Type -AssemblyName "System.IO.Compression"
    Add-Type -AssemblyName "System.IO.Compression.FileSystem"
} catch {
    Write-Error "Failed to load .NET compression assemblies. Ensure you have .NET Framework installed."
    exit 1
}

$outputFile = "workspaces.xpi"
$tempDir = "temp_build"

# Clean up
if (Test-Path $outputFile) { Remove-Item $outputFile -Force }
if (Test-Path $tempDir) { Remove-Item $tempDir -Recurse -Force }

# Create temp directory structure
New-Item -ItemType Directory -Path $tempDir | Out-Null

# Copy specific files/folders to avoid including junk
$files = @("manifest.json", "background.js", "README.md", "PRIVACY.md")
$folders = @("shared", "popup", "options", "sidebar", "icons")

foreach ($f in $files) {
    if (Test-Path $f) { Copy-Item $f -Destination $tempDir }
}

foreach ($f in $folders) {
    if (Test-Path $f) { Copy-Item $f -Destination $tempDir -Recurse }
}

# Create zip using .NET classes
$destinationPath = Join-Path (Get-Location) $outputFile
$zipMode = [System.IO.Compression.ZipArchiveMode]::Create
$zip = [System.IO.Compression.ZipFile]::Open($destinationPath, $zipMode)

# Add files with forward slashes
$filesToZip = Get-ChildItem -Path $tempDir -Recurse -File
$basePath = (Get-Item $tempDir).FullName

foreach ($file in $filesToZip) {
    $relativePath = $file.FullName.Substring($basePath.Length + 1)
    # Critical: Convert to forward slashes for Firefox/AMO
    $entryName = $relativePath -replace '\\', '/'
    
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $file.FullName, $entryName) | Out-Null
    Write-Host "Added: $entryName"
}

$zip.Dispose()

# Clean up temp directory
Remove-Item $tempDir -Recurse -Force

Write-Host ""
Write-Host "Success! Created $outputFile" -ForegroundColor Green
Write-Host "File size: $((Get-Item $outputFile).Length / 1KB) KB"
