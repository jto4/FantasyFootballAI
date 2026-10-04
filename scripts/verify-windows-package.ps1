param(
  [Parameter(Mandatory = $true)]
  [string]$PackageDirectory
)

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($env:WINDOWS_CERTIFICATE_FILE) -or
    [string]::IsNullOrWhiteSpace($env:WINDOWS_CERTIFICATE_PASSWORD)) {
  throw 'Windows signing certificate environment is not configured.'
}

$installers = @(Get-ChildItem -Path $PackageDirectory -Filter '*Setup.exe' -File -Recurse)
if ($installers.Count -ne 1) {
  throw "Expected exactly one Squirrel Setup.exe, found $($installers.Count)."
}

$securePassword = ConvertTo-SecureString $env:WINDOWS_CERTIFICATE_PASSWORD -AsPlainText -Force
$certificate = [System.Security.Cryptography.X509Certificates.X509Certificate2]::new(
  $env:WINDOWS_CERTIFICATE_FILE,
  $securePassword,
  [System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]::EphemeralKeySet
)

$codeSigningOid = '1.3.6.1.5.5.7.3.3'
$hasCodeSigningUsage = @($certificate.Extensions | Where-Object {
  $_ -is [System.Security.Cryptography.X509Certificates.X509EnhancedKeyUsageExtension]
} | ForEach-Object { $_.EnhancedKeyUsages } | ForEach-Object { $_.Value }) -contains $codeSigningOid
if (-not $hasCodeSigningUsage) {
  throw 'The configured certificate does not include the code-signing extended key usage.'
}

$signature = Get-AuthenticodeSignature -FilePath $installers[0].FullName
if ($signature.Status -ne 'Valid') {
  throw "Installer Authenticode status is '$($signature.Status)', expected 'Valid'."
}
if ($null -eq $signature.SignerCertificate -or
    $signature.SignerCertificate.Thumbprint -ne $certificate.Thumbprint) {
  throw 'Installer signer does not match the configured release certificate.'
}

Write-Output "Verified signed installer: $($installers[0].Name)"
