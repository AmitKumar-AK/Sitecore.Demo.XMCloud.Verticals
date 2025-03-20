<#
.SYNOPSIS
    This script performs a clean installation of the Sitecore XM Cloud Full-stack local development environment

.DESCRIPTION
    The script is designed to automate the process of cleaning up any previous installations and setting up a fresh environment for the Sitecore XM Cloud project. 
    It includes steps to remove existing files, reset configurations, and install necessary dependencies.

.PARAMETERS
    None

.EXAMPLE
    .\clean-install.ps1
    This command runs the script to perform a clean installation.

.NOTES
    Created By: Amit Kumar
    Updated By: Amit Kumar
    Created Date: 2025-03-20
    Update Date: 2025-03-20
    Version: 1.0
    This script is intended for use in a development environment.

#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $false, HelpMessage = "Specifies the path of the .env file.")]
    [ValidateSet(".env", "site-two\.env")]
    [string]$EnvFileName = ".env"
)

# Get the environment variable from the .env file
function GetEnvVariable {
    param(
        [Parameter(Mandatory = $true, HelpMessage = "Specifies the path of the .env file.")]
        [string]$filePath = ".env",  # The path to the .env file, defaulting to ".env"
        
        [Parameter(Mandatory = $true, HelpMessage = "Specifies the .env name.")]
        [string]$varName  # The name of the environment variable to retrieve
    )

    Write-Host "Inside GetEnvVariable"  # Debug message indicating function entry

    # Resolve the full path of the .env file based on the script's location
    $envFilePath = Resolve-Path "$PSScriptRoot\$filePath"

    # Check if the .env file exists
    if (Test-Path $envFilePath) {
        # Ensure that the variable name is not empty
        if ($varName -ne "" -and $envFilePath -ne "") {
            Write-Host "Using .env file: $envFilePath" -ForegroundColor Cyan  # Inform which .env file is being used
            
            # Read the contents of the .env file into an array
            $envFileContent = Get-Content -Path $envFilePath

            # Iterate through each line to find the specified variable
            foreach ($line in $envFileContent) {
                # Match the line against the pattern for the variable
                if ($line -match "^\s*$varName\s*=\s*(.+)\s*$") {
                    $varValue = $matches[1].Trim()  # Extract and trim the variable value
                    Write-Host "Environment variable '$varName' found with value '$varValue'."  # Inform about the found variable
                    return $varValue  # Return the variable value
                }
            }

            # If the variable is not found, inform the user
            Write-Host "Environment variable '$varName' not found in the .env file." -ForegroundColor Yellow
            return $null  # Return null if the variable is not found
        } else {
            Write-Host "Invalid parameters" -ForegroundColor Red  # Inform about invalid parameters
            return $null  # Return null for invalid parameters
        }
    } else {
        # If the .env file does not exist, log an error
        Write-Error "The .env file does not exist at the specified path: $envFilePath"
        return $null  # Return null if the file is missing
    }
}

Write-Host "The purpose of this script to start setup from scratch`n" -ForegroundColor Magenta
Write-Host "  1. Stop all containers`n" -ForegroundColor DarkCyan
Write-Host "  2. Docker Prune -Remove all unused containers, networks, images (both dangling and unreferenced), and optionally, volumes`n" -ForegroundColor DarkCyan
Write-Host "  3. Stop IIS, Stop/Start Host Network Service (HNS)`n" -ForegroundColor DarkCyan
Write-Host "  4. Run .\clean.ps1 from Sitecore > Docker`n" -ForegroundColor DarkCyan
Write-Host "  5. Restore Sitecore CLI Tool`n" -ForegroundColor DarkCyan
Write-Host "  6. Run docker compose up command`n" -ForegroundColor DarkCyan

# Store the location of the .env file (now taken from parameter)
$envFilePath = Resolve-Path "$PSScriptRoot\$EnvFileName"  # Resolves the full path of the .env file based on the script's location
if (Test-Path $envFilePath) {  # Checks if the .env file exists
    Write-Host "Using .env file: $envFilePath" -ForegroundColor Cyan  # Outputs the path of the .env file being used
} else {
    Write-Error "The .env file does not exist at the specified path: $envFilePath"  # Logs an error if the file is missing
    throw "The .env file does not exist at the specified path: $envFilePath"  # Throws an exception to halt execution
}

# Retrieve the COMPOSE_PROJECT_NAME variable from the .env file
$composeProjectName = GetEnvVariable -filePath $EnvFileName -varName "COMPOSE_PROJECT_NAME"

# Check if the COMPOSE_PROJECT_NAME variable is defined
if (($composeProjectName -eq $null) -or ($composeProjectName -eq "")) {
    Write-Error "COMPOSE_PROJECT_NAME is not defined in the .env file."  # Logs an error if the variable is not found
    exit 0  # Exits the script if the variable is missing
}

# Step 1: Stop all running Docker containers associated with the project
Write-Host "`n`n1. Stop all containers..." -ForegroundColor Cyan
docker container stop $(docker container ls -q --filter name=$composeProjectName*);  # Stops containers matching the project name
docker-compose stop; docker-compose down  # Stops and removes all containers defined in the docker-compose file

# Step 2: Prune unused Docker resources
Write-Host "`n`n2. Docker Prune" -ForegroundColor Cyan
docker system prune  # Removes all unused data
docker rmi $(docker images --format "{{.Repository}}:{{.Tag}}" | findstr $composeProjectName)  # Removes images related to the project

# Step 3: Stop IIS and restart Host Network Service (HNS)
Write-Host "`n`n3. Stop IIS, Stop/Start Host Network Service (HNS)" -ForegroundColor Cyan
iisreset /stop; net stop hns; net start hns  # Stops IIS and restarts the HNS

# Step 4: Clean all previous build artifacts
Write-Host "`n`n4. Clean all previous build artifacts" -ForegroundColor Cyan
Push-Location docker  # Changes the current directory to 'docker'
.\clean.ps1  # Executes the clean script to remove previous build artifacts

# Step 5: Restore Sitecore CLI tool
Write-Host "`n`n5. Restore Sitecore CLI tool" -ForegroundColor Cyan
Pop-Location  # Returns to the previous directory
dotnet tool restore  # Restores the .NET tools specified in the project

# Step 6: Build/Compose Docker
Write-Host "`n`n6. Build/Compose Docker" -ForegroundColor Cyan
Pop-Location  # Returns to the previous directory

# Call the Up Script for XM Cloud
Write-Host "Call the Up Script (up.ps1) for XM Cloud......" -ForegroundColor Cyan
.\up.ps1 -EnvFileName $EnvFileName  # Executes the up script with the specified .env file

# Final message indicating successful setup
Write-Host "***Setup completed successfully***" -ForegroundColor Green  # Outputs a success message