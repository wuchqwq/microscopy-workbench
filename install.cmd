@echo off
REM Python launcher must provide Python 3.10+; paths and arguments retain spaces.
py -3 "%~dp0tools\install_workbench.py" %*
exit /b %errorlevel%
