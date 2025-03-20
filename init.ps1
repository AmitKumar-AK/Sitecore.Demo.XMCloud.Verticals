<#
.SYNOPSIS
    Initializes the Sitecore XM Cloud Full-stack local development environment.

.DESCRIPTION
    This script sets up the necessary environment for the Sitecore XM Cloud Full-stack local development environment project. It includes steps to initialize environment variables, configure TLS/HTTPS certificates, add Windows hosts file entries, and install required modules.

.PARAMETERS
    -InitEnv
        Enables initialization of values in the .env file, which may be placed in source control.

    -LicenseXmlPath
        The path to a valid Sitecore license.xml file.

    -AdminPassword
        Sets the sitecore\admin password for this environment via environment variable.

    -baseOs
        Specifies the OS version of the base image. Default is "ltsc2019".

    -EnvFileName
        Specifies the path of the .env file. Default is ".env".

.EXAMPLE
    .\init.ps1 -InitEnv -LicenseXmlPath "C:\path\to\license.xml" -AdminPassword "yourpassword"
    This command initializes the environment with the specified license file and admin password.

.NOTES
    Created By: Sitecore
    Updated By: Amit Kumar
    Created Date: 2023-10-15
    Update Date: 2025-03-20
    Version: 1.1
    This script is intended for use in a development environment.
#>

[CmdletBinding(DefaultParameterSetName = "no-arguments")]
Param (
    [Parameter(HelpMessage = "Enables initialization of values in the .env file, which may be placed in source control.",
        ParameterSetName = "env-init")]
    [switch]$InitEnv,

    [Parameter(Mandatory = $true,
        HelpMessage = "The path to a valid Sitecore license.xml file.",
        ParameterSetName = "env-init")]
    [string]$LicenseXmlPath,

    # We do not need to use [SecureString] here since the value will be stored unencrypted in .env,
    # and used only for transient local development environments.
    [Parameter(Mandatory = $true,
        HelpMessage = "Sets the sitecore\\admin password for this environment via environment variable.",
        ParameterSetName = "env-init")]
    [string]$AdminPassword,

    [Parameter(Mandatory = $false, HelpMessage = "Specifies os version of the base image.")]
    [ValidateSet("ltsc2019", "ltsc2022")]
    [string]$baseOs = "ltsc2019",

    [Parameter(Mandatory = $false, HelpMessage = "Specifies the path of the .env file.")]
    [ValidateSet(".env", "site-two\.env")]
    [string]$EnvFileName = ".env"
)

$ErrorActionPreference = "Stop";

# Set the environment variable in the .env file
function SetEnvVariable {
    param(
        [string]$filePath=".env",  # Default path for the .env file
        [string]$varName,          # Name of the environment variable to set
        [string]$varValue          # Value to assign to the environment variable
    )

    Write-Host "Inside SetEnvVariable"  # Log entry into the function

    $envFilePath = Resolve-Path "$PSScriptRoot\$filePath"  # Resolve the full path of the .env file

    if (Test-Path $envFilePath) {  # Check if the .env file exists
        if ($varName  -ne "" -and  $varValue  -ne "" -and $envFilePath  -ne "") {  # Ensure parameters are not empty
            Write-Host "Using .env file: $envFilePath" -ForegroundColor Cyan  # Log the file being used
            # Read the contents of the .env file
            $envFileContent = Get-Content -Path $envFilePath  # Load the file content into an array

            # Initialize a flag to check if the variable was found
            $variableFound = $false  # Flag to track if the variable exists

            # Iterate through each line and update the variable if found
            $updatedContent = $envFileContent | ForEach-Object {
                if ($_ -match "^\s*$varName\s*=") {  # Check if the line matches the variable name
                    $variableFound = $true  # Set flag to true if found
                    "$varName=$varValue"  # Update the line with the new value
                } else {
                    $_  # Keep the line unchanged if not matched
                }
            }

            # If the variable was not found, add it to the end of the file
            if (-not $variableFound) {
                $updatedContent += "$varName=$varValue"  # Append the new variable to the content
            }

            # Write the updated content back to the .env file
            Set-Content -Path $envFilePath -Value $updatedContent -Force  # Save changes to the file

            Write-Host "Environment variable '$varName' set to '$varValue' in the .env file."  # Log success message
        } else {
            Write-Host "Invalid parameters" -ForegroundColor Red  # Log error for invalid parameters
        }
    }
    else {
        Write-Error "The .env file does not exist at the specified path: $envFilePath"  # Log error if file doesn't exist
    }
}

# Get the environment variable from the .env file
function GetEnvVariable {
    param(
        [Parameter(Mandatory = $true, HelpMessage = "Specifies the path of the .env file.")]
        [string]$filePath = ".env",  # Default path for the .env file
        [Parameter(Mandatory = $true, HelpMessage = "Specifies the .env name.")]
        [string]$varName  # Name of the environment variable to retrieve
    )

    Write-Host "Inside GetEnvVariable"  # Log entry into the function

    $envFilePath = Resolve-Path "$PSScriptRoot\$filePath"  # Resolve the full path of the .env file

    if (Test-Path $envFilePath) {  # Check if the .env file exists
        if ($varName -ne "" -and $envFilePath -ne "") {  # Ensure parameters are not empty
            Write-Host "Using .env file: $envFilePath" -ForegroundColor Cyan  # Log the file being used
            # Read the contents of the .env file
            $envFileContent = Get-Content -Path $envFilePath  # Load the file content into an array

            # Iterate through each line to find the variable
            foreach ($line in $envFileContent) {
                if ($line -match "^\s*$varName\s*=\s*(.+)\s*$") {  # Check if the line matches the variable name
                    $varValue = $matches[1].Trim()  # Extract the variable value
                    Write-Host "Environment variable '$varName' found with value '$varValue'."  # Log success message
                    return $varValue  # Return the found value
                }
            }

            Write-Host "Environment variable '$varName' not found in the .env file." -ForegroundColor Yellow  # Log if not found
            return $null  # Return null if not found
        } else {
            Write-Host "Invalid parameters" -ForegroundColor Red  # Log error for invalid parameters
            return $null  # Return null for invalid parameters
        }
    } else {
        Write-Error "The .env file does not exist at the specified path: $envFilePath"  # Log error if file doesn't exist
        return $null  # Return null if file doesn't exist
    }
}

if ($InitEnv) {
    if (-not $LicenseXmlPath.EndsWith("license.xml")) {
        Write-Error "Sitecore license file must be named 'license.xml'."
    }
    if (-not (Test-Path $LicenseXmlPath)) {
        Write-Error "Could not find Sitecore license file at path '$LicenseXmlPath'."
    }
    # We actually want the folder that it's in for mounting
    $LicenseXmlPath = (Get-Item $LicenseXmlPath).Directory.FullName
}

Write-Host "Preparing your Sitecore Containers environment!" -ForegroundColor Green

# Ge the "RENDERING_HOST" Url from .env file
$renderingHost = GetEnvVariable -filePath $EnvFileName -varName "RENDERING_HOST"

if (($renderingHost -eq $null) -or ($renderingHost -eq ""))
{
    Write-Error "RENDERING_HOST is not defined in the .env file."
    exit 0
}


################################################
# Retrieve and import SitecoreDockerTools module
################################################

# Check for Sitecore Gallery
Import-Module PowerShellGet
$SitecoreGallery = Get-PSRepository | Where-Object { $_.SourceLocation -eq "https://nuget.sitecore.com/resources/v2" }
if (-not $SitecoreGallery) {
    Write-Host "Adding Sitecore PowerShell Gallery..." -ForegroundColor Green
    Unregister-PSRepository -Name SitecoreGallery -ErrorAction SilentlyContinue
    Register-PSRepository -Name SitecoreGallery -SourceLocation https://nuget.sitecore.com/resources/v2 -InstallationPolicy Trusted
    $SitecoreGallery = Get-PSRepository -Name SitecoreGallery
}

# Install and Import SitecoreDockerTools
$dockerToolsVersion = "10.2.7"
Remove-Module SitecoreDockerTools -ErrorAction SilentlyContinue
if (-not (Get-InstalledModule -Name SitecoreDockerTools -RequiredVersion $dockerToolsVersion -ErrorAction SilentlyContinue)) {
    Write-Host "Installing SitecoreDockerTools..." -ForegroundColor Green
    Install-Module SitecoreDockerTools -RequiredVersion $dockerToolsVersion -Scope CurrentUser -Repository $SitecoreGallery.Name
}
Write-Host "Importing SitecoreDockerTools..." -ForegroundColor Green
Import-Module SitecoreDockerTools -RequiredVersion $dockerToolsVersion
Write-SitecoreDockerWelcome

##################################
# Configure TLS/HTTPS certificates
##################################

Push-Location docker\traefik\certs
try {
    $mkcert = ".\mkcert.exe"
    if ($null -ne (Get-Command mkcert.exe -ErrorAction SilentlyContinue)) {
        # mkcert installed in PATH
        $mkcert = "mkcert"
    } elseif (-not (Test-Path $mkcert)) {
        Write-Host "Downloading and installing mkcert certificate tool..." -ForegroundColor Green
        Invoke-WebRequest "https://github.com/FiloSottile/mkcert/releases/download/v1.4.1/mkcert-v1.4.1-windows-amd64.exe" -UseBasicParsing -OutFile mkcert.exe
        if ((Get-FileHash mkcert.exe).Hash -ne "1BE92F598145F61CA67DD9F5C687DFEC17953548D013715FF54067B34D7C3246") {
            Remove-Item mkcert.exe -Force
            throw "Invalid mkcert.exe file"
        }
    }
    Write-Host "Generating Traefik TLS certificate..." -ForegroundColor Green
    & $mkcert -install
    & $mkcert "*.sxastarter.localhost"
    & $mkcert "xmcloudcm.localhost"
    & $mkcert $renderingHost

    # stash CAROOT path for messaging at the end of the script
    $caRoot = "$(& $mkcert -CAROOT)\rootCA.pem"
}
catch {
    Write-Error "An error occurred while attempting to generate TLS certificate: $_"
}
finally {
    Pop-Location
}


################################
# Add Windows hosts file entries
################################

Write-Host "Adding Windows hosts file entries..." -ForegroundColor Green

Add-HostsEntry "xmcloudcm.localhost"
Add-HostsEntry "www.sxastarter.localhost"
Add-HostsEntry "services.sxastarter.localhost"
Add-HostsEntry "financial.sxastarter.localhost"
Add-HostsEntry $renderingHost

if ($EnvFileName -eq "site-two\.env")
{
    $JSONFilePath = Resolve-Path "$PSScriptRoot\site-two\xmcloud.build.json"

    if (Test-Path $JSONFilePath) {
        Write-Host "Using XMC Build JSON file: $JSONFilePath"
	
        $jsonContent = Get-Content -Path $JSONFilePath -Raw | ConvertFrom-Json

        ###############################
        # Generate scjssconfig
        ###############################

        SetEnvVariable $EnvFileName "JSS_DEPLOYMENT_SECRET_xmcloudpreview" $jsonContent.renderingHosts.xmcloudpreview.jssDeploymentSecret
    }

    ################################
    # Generate Sitecore Api Key
    ################################

    # DEMO TEAM CUSTOMIZATION - Remove generation of the Sitecore API key. We want a fixed key.

    ################################
    # Generate JSS_EDITING_SECRET
    ################################
    $jssEditingSecret = Get-SitecoreRandomString 64 -DisallowSpecial
    #Set-EnvFileVariable "JSS_EDITING_SECRET" -Value $jssEditingSecret

    SetEnvVariable $EnvFileName "JSS_EDITING_SECRET" $jssEditingSecret
}
else
{
    $JSONFilePath = Resolve-Path "$PSScriptRoot\xmcloud.build.json"

    if (Test-Path $JSONFilePath) {
        Write-Host "Using XMC Build JSON file: $JSONFilePath"

        $jsonContent = Get-Content -Path $JSONFilePath -Raw | ConvertFrom-Json

        ###############################
        # Generate scjssconfig
        ###############################

        Set-EnvFileVariable "JSS_DEPLOYMENT_SECRET_xmcloudpreview" -Value $jsonContent.renderingHosts.xmcloudpreview.jssDeploymentSecret
    }

    ################################
    # Generate Sitecore Api Key
    ################################

    # DEMO TEAM CUSTOMIZATION - Remove generation of the Sitecore API key. We want a fixed key.

    ################################
    # Generate JSS_EDITING_SECRET
    ################################
    $jssEditingSecret = Get-SitecoreRandomString 64 -DisallowSpecial
    Set-EnvFileVariable "JSS_EDITING_SECRET" -Value $jssEditingSecret
}

###############################
# Populate the environment file
###############################

if ($InitEnv -and $EnvFileName -eq "site-two\.env")
{
    Write-Host "[INFO] Using .env file $EnvFileName" -ForegroundColor Red

    Write-Host "Populating required .env file values..." -ForegroundColor Green

    # HOST_LICENSE_FOLDER
    SetEnvVariable $EnvFileName "HOST_LICENSE_FOLDER" $LicenseXmlPath

    # CM_HOST
    SetEnvVariable $EnvFileName "CM_HOST" "xmcloudcm.localhost"

    # RENDERING_HOST
    SetEnvVariable $EnvFileName "RENDERING_HOST" "www.sitetwo.sxastarter.localhost"

    # REPORTING_API_KEY = random 64-128 chars
    SetEnvVariable $EnvFileName "REPORTING_API_KEY" (Get-SitecoreRandomString 128 -DisallowSpecial)

    # TELERIK_ENCRYPTION_KEY = random 64-128 chars
    SetEnvVariable $EnvFileName "TELERIK_ENCRYPTION_KEY" (Get-SitecoreRandomString 128)

    # MEDIA_REQUEST_PROTECTION_SHARED_SECRET
    SetEnvVariable $EnvFileName "MEDIA_REQUEST_PROTECTION_SHARED_SECRET" (Get-SitecoreRandomString 64)

    # SQL_SA_PASSWORD
    # Need to ensure it meets SQL complexity requirements
    SetEnvVariable $EnvFileName "SQL_SA_PASSWORD" (Get-SitecoreRandomString 19 -DisallowSpecial -EnforceComplexity)

    # SQL_SERVER
    SetEnvVariable $EnvFileName "SQL_SERVER" "mssql"

    # SQL_SA_LOGIN
    SetEnvVariable $EnvFileName "SQL_SA_LOGIN" "sa"

    # SITECORE_ADMIN_PASSWORD
    SetEnvVariable $EnvFileName "SITECORE_ADMIN_PASSWORD" $AdminPassword

    # SITECORE_VERSION
    SetEnvVariable $EnvFileName "SITECORE_VERSION" "1-$baseOS"

    # EXTERNAL_IMAGE_TAG_SUFFIX
    SetEnvVariable $EnvFileName "EXTERNAL_IMAGE_TAG_SUFFIX" $baseOS
}
elseif ($InitEnv -and $EnvFileName -eq ".env")
{
    Write-Host "[INFO] Using .env file $EnvFileName" -ForegroundColor Red

    Write-Host "Populating required .env file values..." -ForegroundColor Green

    # HOST_LICENSE_FOLDER
    Set-EnvFileVariable "HOST_LICENSE_FOLDER" -Value $LicenseXmlPath

    # CM_HOST
    Set-EnvFileVariable "CM_HOST" -Value "xmcloudcm.localhost"

    # RENDERING_HOST
    Set-EnvFileVariable "RENDERING_HOST" -Value "www.sxastarter.localhost"

    # REPORTING_API_KEY = random 64-128 chars
    Set-EnvFileVariable "REPORTING_API_KEY" -Value (Get-SitecoreRandomString 128 -DisallowSpecial)

    # TELERIK_ENCRYPTION_KEY = random 64-128 chars
    Set-EnvFileVariable "TELERIK_ENCRYPTION_KEY" -Value (Get-SitecoreRandomString 128)

    # MEDIA_REQUEST_PROTECTION_SHARED_SECRET
    Set-EnvFileVariable "MEDIA_REQUEST_PROTECTION_SHARED_SECRET" -Value (Get-SitecoreRandomString 64)

    # SQL_SA_PASSWORD
    # Need to ensure it meets SQL complexity requirements
    Set-EnvFileVariable "SQL_SA_PASSWORD" -Value (Get-SitecoreRandomString 19 -DisallowSpecial -EnforceComplexity)

    # SQL_SERVER
    Set-EnvFileVariable "SQL_SERVER" -Value "mssql"

    # SQL_SA_LOGIN
    Set-EnvFileVariable "SQL_SA_LOGIN" -Value "sa"

    # SITECORE_ADMIN_PASSWORD
    Set-EnvFileVariable "SITECORE_ADMIN_PASSWORD" -Value $AdminPassword

    # SITECORE_VERSION
    Set-EnvFileVariable "SITECORE_VERSION" -Value "1-$baseOS"

    # EXTERNAL_IMAGE_TAG_SUFFIX
    Set-EnvFileVariable "EXTERNAL_IMAGE_TAG_SUFFIX" -Value $baseOS
}

Write-Host "Done!" -ForegroundColor Green

Push-Location docker\traefik\certs
try
{
    Write-Host
    Write-Host ("#"*75) -ForegroundColor Cyan
    Write-Host "To avoid HTTPS errors, set the NODE_EXTRA_CA_CERTS environment variable" -ForegroundColor Cyan
    Write-Host "using the following commmand:" -ForegroundColor Cyan
    Write-Host "setx NODE_EXTRA_CA_CERTS $caRoot"
    Write-Host
    Write-Host "You will need to restart your terminal or VS Code for it to take effect." -ForegroundColor Cyan
    Write-Host ("#"*75) -ForegroundColor Cyan
}
catch {
    Write-Error "An error occurred while attempting to generate TLS certificate: $_"
}
finally {
    Pop-Location
}