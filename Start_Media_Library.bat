@echo off
echo Starting Media Library Backend...
start cmd /k "cd backend && node server.js"

echo Starting Media Library Frontend...
start cmd /k "cd frontend && npm run dev"

echo Everything is starting! 
echo The frontend will provide a local URL (usually http://localhost:5173/)
echo You can keep these two black command windows open while you use the app.
