Option Explicit
Dim shell, fso, folder, handler, uri, matcher, command, quote
If WScript.Arguments.Count <> 1 Then WScript.Quit 1
uri = WScript.Arguments(0)
Set matcher = New RegExp
matcher.Pattern = "^eskaajazzgif://(launch|folder|file|pick)/[A-Za-z0-9_-]+/?$"
matcher.IgnoreCase = True
If Not matcher.Test(uri) Then WScript.Quit 1
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
folder = fso.GetParentFolderName(WScript.ScriptFullName)
handler = fso.BuildPath(folder, "open-target.ps1")
quote = Chr(34)
command = quote & shell.ExpandEnvironmentStrings("%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe") & quote & " -STA -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File " & quote & handler & quote & " " & quote & uri & quote
shell.Run command, 0, False
