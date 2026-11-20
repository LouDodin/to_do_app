# Applies changes to the main account's own tasks (validate, move to a project, complete), asked
# through Claude from the Mac: see tools\task_ops.py. Run by "Tasks auto-update" for
# requests\task-ops.request (6 Nov 2026). Nothing is ever deleted.
param([string]$InputFile = '', [switch]$NoPause)
. "$PSScriptRoot\_common.ps1"
Start-Log 'task-ops'
Step 'Changing tasks'
if (-not $InputFile -or -not (Test-Path $InputFile)) { Fail 'no list of changes'; Stop-Log -NoPause; exit 1 }
$py = Find-Python
if (-not $py) { Fail "Python not found"; Stop-Log -NoPause; exit 1 }
& $py -I (Join-Path $Root 'tools\task_ops.py') $InputFile 2>&1 | ForEach-Object { "   $_" }
$code = $LASTEXITCODE
if ($code -ne 0) { Fail 'some tasks could not be changed (see above)' } else { Ok 'all the tasks were changed' }
Stop-Log -NoPause
exit $code
