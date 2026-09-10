$f = 'x:\Project-Buildings\Communication\src\routes\_authenticated\chats.$conversationId.tsx'
$c = [System.IO.File]::ReadAllText($f)
$fixed = $c -replace ' = \(\) => \{', 'const submit = () => {'
[System.IO.File]::WriteAllText($f, $fixed)
Write-Host "Done"
