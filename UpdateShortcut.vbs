Set WshShell = WScript.CreateObject("WScript.Shell")
strDesktop = WshShell.SpecialFolders("Desktop")
Set oShellLink = WshShell.CreateShortcut(strDesktop & "\Iniciar Projeto.lnk")
oShellLink.TargetPath = "C:\Users\User1\Desktop\TEST-SEARCH\IniciarProjeto.vbs"
oShellLink.WorkingDirectory = "C:\Users\User1\Desktop\TEST-SEARCH"
oShellLink.IconLocation = "C:\Windows\System32\shell32.dll,70"
oShellLink.Save
