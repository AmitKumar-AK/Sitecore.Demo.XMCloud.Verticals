<#
.SYNOPSIS
    Starts the Sitecore XM Cloud Full-stack local development environment.

.DESCRIPTION
    This script is used to start the Sitecore XM Cloud Full-stack local development environment by initializing necessary services, setting up environment variables, and ensuring all required components are running. It includes steps to read configuration from the .env file, start Docker containers, and verify the status of the services.

.PARAMETERS
    -EnvFileName
        Specifies the path of the .env file. Default is ".env".

    -Verbose
        Enables verbose output for detailed logging.

.EXAMPLE
    .\up.ps1 -EnvFileName "site-two\.env" -Verbose
    This command starts the environment using the specified .env file with verbose logging enabled.

.NOTES
    Created By: Sitecore
    Updated By: Amit Kumar
    Created Date: 2023-10-15
    Update Date: 2025-03-20
    Version: 1.1
    This script is intended for use in a development environment.
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $false, HelpMessage = "Specifies the path of the .env file.")]
    [ValidateSet(".env", "site-two\.env")]
    [string]$EnvFileName = ".env"
)

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

# Store the location of the .env file (now taken from parameter)
$envFilePath = Resolve-Path "$PSScriptRoot\$EnvFileName"
if (Test-Path $envFilePath) {
    Write-Host "Using .env file: $envFilePath" -ForegroundColor Cyan
} else {
    Write-Error "The .env file does not exist at the specified path: $envFilePath"
    return
}

# Set the error action preference to stop on errors
$ErrorActionPreference = "Stop";

# Load the functions defined in the upFunctions.ps1 script
. .\upFunctions.ps1

# Validate the license expiry using the specified .env file path
Validate-LicenseExpiry -EnvFileName $envFilePath

# Retrieve various environment variables from the .env file
$xmCloudHost = GetEnvVariable -filePath $EnvFileName -varName "CM_HOST"
$sitecoreDockerRegistry = GetEnvVariable -filePath $EnvFileName -varName "SITECORE_DOCKER_REGISTRY"
$sitecoreVersion = GetEnvVariable -filePath $EnvFileName -varName "SITECORE_VERSION"
$ClientCredentialsLogin = GetEnvVariable -filePath $EnvFileName -varName "SITECORE_FedAuth_dot_Auth0_dot_ClientCredentialsLogin"
$sitecoreApiKey = GetEnvVariable -filePath $EnvFileName -varName "SITECORE_API_KEY_APP_STARTER"
$xmcloudDockerToolsImage = GetEnvVariable -filePath $EnvFileName -varName "TOOLS_IMAGE"
$renderingHost = GetEnvVariable -filePath $EnvFileName -varName "RENDERING_HOST"

# If client credentials login is enabled, retrieve additional variables
if ($ClientCredentialsLogin -eq "true") {
    $xmCloudClientCredentialsLoginDomain = GetEnvVariable -filePath $EnvFileName -varName "SITECORE_FedAuth_dot_Auth0_dot_Domain" 
    $xmCloudClientCredentialsLoginAudience = GetEnvVariable -filePath $EnvFileName -varName "SITECORE_FedAuth_dot_Auth0_dot_ClientCredentialsLogin_Audience"
    $xmCloudClientCredentialsLoginClientId = GetEnvVariable -filePath $EnvFileName -varName "SITECORE_FedAuth_dot_Auth0_dot_ClientCredentialsLogin_ClientId"
    $xmCloudClientCredentialsLoginClientSecret = GetEnvVariable -filePath $EnvFileName -varName "SITECORE_FedAuth_dot_Auth0_dot_ClientCredentialsLogin_ClientSecret"
}

# Set the path for the JSON file based on the .env file name
if ($EnvFileName -eq "site-two\.env") {
    $JSONFilePath = Resolve-Path "$PSScriptRoot\site-two\xmcloud.build.json"
} else {
    $JSONFilePath = Resolve-Path "$PSScriptRoot\xmcloud.build.json"
}

# Check if the JSON file exists and load its content
if (Test-Path $JSONFilePath) {
    Write-Host "Using XMC JSON file: $JSONFilePath" -ForegroundColor Cyan

    # Load the JSON file and extract the Node.js version
    $xmCloudBuild = Get-Content -Path $JSONFilePath -Raw | ConvertFrom-Json
    $nodeVersion = $xmCloudBuild.renderingHosts.nextjsstarter.nodeVersion

    # If a valid Node.js version is found, set it in the .env file
    if (![string]::IsNullOrWhitespace($nodeVersion)) {
        SetEnvVariable $EnvFileName "NODEJS_VERSION" $xmCloudBuild.renderingHosts.nextjsstarter.nodeVersion
    }
} else {
    Write-Error "The xmcloud.build.json file does not exist at the specified path: $JSONFilePath"
    return
}

# Check if the initialization script has been run by verifying the admin password variable
$envCheckVariable = "SITECORE_ADMIN_PASSWORD"
$envCheck = GetEnvVariable -filePath $EnvFileName -varName $envCheckVariable
if (-not $envCheck) {
    # If not initialized, run the init.ps1 script with default values
    if (Test-Path "C:\License") {
        Write-Host "Initializing environment using default values" -ForegroundColor Yellow
        & .\init.ps1 -InitEnv -AdminPassword b -LicenseXmlPath C:\License\license.xml -EnvFileName $EnvFileName
    } else {
        throw "$envCheckVariable does not have a value. Did you run 'init.ps1 -InitEnv'?"
    }
}

# Pull the latest Sitecore base image from the Docker registry
Write-Host "Keeping XM Cloud base image up to date" -ForegroundColor Green
docker pull "$($sitecoreDockerRegistry)sitecore-xmcloud-cm:$($sitecoreVersion)"

# Pull the latest Sitecore tools image from the Docker registry
Write-Host "Keeping XM Cloud Tools image up to date" -ForegroundColor Green
docker pull "$($xmcloudDockerToolsImage):$($sitecoreVersion)"

# Build all containers in the Sitecore instance, forcing a pull of the latest base containers
Write-Host "Building containers..." -ForegroundColor Green
docker compose --env-file $envFilePath build
if ($LASTEXITCODE -ne 0) {
    Write-Error "Container build failed, see errors above."
}

# Start the Sitecore instance in detached mode
Write-Host "Starting Sitecore environment..." -ForegroundColor Green
docker compose --env-file $envFilePath up -d

# Wait for Traefik to expose the CM route
Write-Host "Waiting for CM to become available..." -ForegroundColor Green
$startTime = Get-Date
do {
    Start-Sleep -Milliseconds 100
    try {
        $status = Invoke-RestMethod "http://localhost:8079/api/http/routers/cm-secure@docker"
    } catch {
        if ($_.Exception.Response.StatusCode.value__ -ne "404") {
            throw
        }
    }
} while ($status.status -ne "enabled" -and $startTime.AddSeconds(15) -gt (Get-Date))
if (-not $status.status -eq "enabled") {
    $status
    Write-Error "Timeout waiting for Sitecore CM to become available via Traefik proxy. Check CM container logs."
}

# Restore Sitecore CLI tools
Write-Host "Restoring Sitecore CLI..." -ForegroundColor Green
dotnet tool restore
Write-Host "Installing Sitecore CLI Plugins..."
dotnet sitecore --help | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Error "Unexpected error installing Sitecore CLI Plugins"
}

# Log into Sitecore using the appropriate credentials
Write-Host "Logging into Sitecore..." -ForegroundColor Green
if ($ClientCredentialsLogin -eq "true") {
    dotnet sitecore cloud login --client-id $xmCloudClientCredentialsLoginClientId --client-secret $xmCloudClientCredentialsLoginClientSecret --client-credentials true
    dotnet sitecore login --authority $xmCloudClientCredentialsLoginDomain --audience $xmCloudClientCredentialsLoginAudience --client-id $xmCloudClientCredentialsLoginClientId --client-secret $xmCloudClientCredentialsLoginClientSecret --cm https://$xmCloudHost --client-credentials true --allow-write true
} else {
    dotnet sitecore cloud login
    dotnet sitecore connect --ref xmcloud --cm https://$xmCloudHost --allow-write true -n default
}

# Check for login errors
if ($LASTEXITCODE -ne 0) {
    Write-Error "Unable to log into Sitecore, did the Sitecore environment start correctly? See logs above."
}

# Populate Solr managed schemas to avoid errors during item deployment
Write-Host "Populating Solr managed schema..." -ForegroundColor Green
dotnet sitecore index schema-populate
if ($LASTEXITCODE -ne 0) {
    Write-Error "Populating Solr managed schema failed, see errors above."
}

# Push Sitecore items to the server
Write-Host "Pushing Sitecore items" -ForegroundColor Green
dotnet sitecore ser push

# Restart the rendering service
docker compose --env-file $envFilePath restart rendering

# Rebuild indexes in Sitecore
Write-Host "Rebuilding indexes ..." -ForegroundColor Green
dotnet sitecore index rebuild

# If client credentials login is not used, open the Sitecore site in a browser
if ($ClientCredentialsLogin -ne "true") {
    Write-Host "Opening site..." -ForegroundColor Green
    Start-Process https://$xmCloudHost/sitecore/
    Start-Process https://$renderingHost/
}

# Provide instructions for monitoring the rendering host logs
Write-Host ""
Write-Host "Use the following command to monitor your Rendering Host:" -ForegroundColor Green
Write-Host "docker compose logs -f rendering"
Write-Host ""