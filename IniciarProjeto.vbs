Set WshShell = CreateObject("WScript.Shell")
CurrentDirectory = "C:\Users\User1\Desktop\TEST-SEARCH"
WshShell.CurrentDirectory = CurrentDirectory
WshShell.Run "cmd /c npm start", 0, false
WScript.Sleep 5000
WshShell.Run "cmd /c start index.html", 0, false
