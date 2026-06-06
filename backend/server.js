require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for all origins (allows cross-domain requests from separate frontend hosts)
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Setup multer for parsing multipart/form-data
const upload = multer();

// Paths
const DATA_DIR = path.join(__dirname, 'data');
const JSON_FILE = path.join(DATA_DIR, 'submissions.json');
const CSV_FILE = path.join(DATA_DIR, 'submissions.csv');

// Ensure data directory and files exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(JSON_FILE)) {
  fs.writeFileSync(JSON_FILE, JSON.stringify([]));
}
if (!fs.existsSync(CSV_FILE)) {
  fs.writeFileSync(CSV_FILE, 'Timestamp,Name,Email,University,Branch,Department,SnoxxProject,PublishableProject\n');
}

// Helper to escape values for CSV
function escapeCsv(value) {
  if (value === null || value === undefined) return '';
  const stringValue = String(value);
  if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n') || stringValue.includes('\r')) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

// Helper to normalize entry object keys (handling spacing/casing mismatches from Google Sheets)
function normalizeSubmissions(data) {
  return (data || []).map(entry => {
    const normalized = {};
    for (const key in entry) {
      const cleanKey = key.replace(/\s+/g, '').toLowerCase();
      if (cleanKey === 'timestamp') {
        normalized.Timestamp = entry[key];
      } else if (cleanKey === 'publishableproject' || cleanKey === 'publishable_project') {
        normalized.PublishableProject = entry[key];
      } else if (cleanKey === 'snoxxproject' || cleanKey === 'snoxx_project') {
        normalized.SnoxxProject = entry[key];
      } else if (cleanKey === 'name') {
        normalized.Name = entry[key];
      } else if (cleanKey === 'email') {
        normalized.Email = entry[key];
      } else if (cleanKey === 'university') {
        normalized.University = entry[key];
      } else if (cleanKey === 'branch') {
        normalized.Branch = entry[key];
      } else if (cleanKey === 'department') {
        normalized.Department = entry[key];
      } else {
        normalized[key] = entry[key];
      }
    }
    // Ensure standard keys are always present even if undefined
    if (normalized.Timestamp === undefined) normalized.Timestamp = '';
    if (normalized.Name === undefined) normalized.Name = '';
    if (normalized.Email === undefined) normalized.Email = '';
    if (normalized.University === undefined) normalized.University = '';
    if (normalized.Branch === undefined) normalized.Branch = '';
    if (normalized.Department === undefined) normalized.Department = '';
    if (normalized.SnoxxProject === undefined) normalized.SnoxxProject = '';
    if (normalized.PublishableProject === undefined) normalized.PublishableProject = '';
    
    return normalized;
  });
}

// Root welcome response
app.get('/', (req, res) => {
  res.json({ 
    status: 'online',
    message: 'Welcome to the Snoxx Intern Selection API',
    endpoints: {
      submit: 'POST /api/submit',
      submissions: 'GET /api/submissions',
      export: 'GET /api/submissions/export',
      clear: 'POST /api/submissions/clear',
      status: 'GET /api/sheets-status'
    }
  });
});

// Route to submit project selection
app.post('/api/submit', upload.none(), async (req, res) => {
  try {
    const { Name, Email, University, Branch, Department, SnoxxProject, PublishableProject } = req.body;

    // Validation
    if (!Name || !Email || !University || !Branch || !Department || !SnoxxProject || !PublishableProject) {
      return res.status(400).json({ 
        success: false, 
        message: 'All fields are required. Please check that you completed all steps.' 
      });
    }

    // 0. Check for duplicate project selection
    let existingSubmissions = [];
    try {
      const scriptUrl = process.env.GOOGLE_SCRIPT_URL;
      if (scriptUrl && scriptUrl.trim() !== '') {
        const sheetsResponse = await fetch(scriptUrl.trim()).catch(() => null);
        if (sheetsResponse && sheetsResponse.ok) {
          const sheetsResult = await sheetsResponse.json().catch(() => ({}));
          if (sheetsResult.success) {
            existingSubmissions = normalizeSubmissions(sheetsResult.data || []);
          }
        }
      }
      if (existingSubmissions.length === 0) {
        const fileData = fs.readFileSync(JSON_FILE, 'utf8');
        existingSubmissions = normalizeSubmissions(JSON.parse(fileData || '[]'));
      }
    } catch (err) {
      console.error('Error fetching submissions for uniqueness check:', err);
    }

    const normalizeText = str => str ? str.replace(/\s+/g, '').toLowerCase() : '';
    const targetSnoxx = normalizeText(SnoxxProject);
    const targetPub = normalizeText(PublishableProject);

    const isSnoxxAlreadyTaken = existingSubmissions.some(sub => normalizeText(sub.SnoxxProject) === targetSnoxx);
    const isPubAlreadyTaken = existingSubmissions.some(sub => normalizeText(sub.PublishableProject) === targetPub);

    if (isSnoxxAlreadyTaken) {
      return res.status(400).json({
        success: false,
        message: `The project "${SnoxxProject}" has already been selected by another student. Please choose a different project.`
      });
    }

    if (isPubAlreadyTaken) {
      return res.status(400).json({
        success: false,
        message: `The project "${PublishableProject}" has already been selected by another student. Please choose a different project.`
      });
    }

    const timestamp = new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
    const newEntry = {
      Timestamp: timestamp,
      Name: Name.trim(),
      Email: Email.trim(),
      University: University.trim(),
      Branch: Branch.trim(),
      Department: Department.trim(),
      SnoxxProject: SnoxxProject.trim(),
      PublishableProject: PublishableProject.trim()
    };

    // 1. Read, update, and write to JSON file
    let submissions = [];
    try {
      const fileData = fs.readFileSync(JSON_FILE, 'utf8');
      submissions = JSON.parse(fileData || '[]');
    } catch (err) {
      console.error('Error reading JSON file, resetting storage:', err);
      submissions = [];
    }

    submissions.push(newEntry);
    fs.writeFileSync(JSON_FILE, JSON.stringify(submissions, null, 2));

    // 2. Append to CSV file
    const csvLine = `${escapeCsv(newEntry.Timestamp)},${escapeCsv(newEntry.Name)},${escapeCsv(newEntry.Email)},${escapeCsv(newEntry.University)},${escapeCsv(newEntry.Branch)},${escapeCsv(newEntry.Department)},${escapeCsv(newEntry.SnoxxProject)},${escapeCsv(newEntry.PublishableProject)}\n`;
    fs.appendFileSync(CSV_FILE, csvLine);

    console.log(`[Success] Recorded submission from ${newEntry.Name} (${newEntry.Email})`);

    // 3. Forward to Google Sheets in the background (non-blocking)
    const scriptUrl = process.env.GOOGLE_SCRIPT_URL;
    if (scriptUrl && scriptUrl.trim() !== '') {
      console.log(`[Info] Forwarding submission for ${newEntry.Name} to Google Sheets...`);
      fetch(scriptUrl.trim(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(newEntry)
      })
      .then(async (response) => {
        if (response.ok) {
          console.log(`[Success] Google Sheets sync completed for ${newEntry.Name}`);
        } else {
          const text = await response.text().catch(() => '');
          console.warn(`[Warning] Google Sheets sync responded with status ${response.status}: ${text}`);
        }
      })
      .catch((err) => {
        console.error(`[Error] Failed to forward to Google Sheets Web App:`, err.message);
      });
    } else {
      console.log(`[Info] Google Sheets sync is disabled (no GOOGLE_SCRIPT_URL set).`);
    }

    return res.status(200).json({ 
      success: true, 
      message: 'Selection recorded successfully.' 
    });
  } catch (error) {
    console.error('Error processing submission:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Internal server error while saving submission.' 
    });
  }
});

// Route to get all submissions
app.get('/api/submissions', async (req, res) => {
  try {
    const scriptUrl = process.env.GOOGLE_SCRIPT_URL;
    if (scriptUrl && scriptUrl.trim() !== '') {
      console.log('[Info] Fetching latest submissions from Google Sheets...');
      try {
        const response = await fetch(scriptUrl.trim());
        if (response.ok) {
          const result = await response.json();
          if (result.success) {
            const submissions = normalizeSubmissions(result.data || []);
            
            // Sync to local files (cache)
            fs.writeFileSync(JSON_FILE, JSON.stringify(submissions, null, 2));
            
            // Re-generate CSV locally
            let csvContent = 'Timestamp,Name,Email,University,Branch,Department,SnoxxProject,PublishableProject\n';
            submissions.forEach(entry => {
              csvContent += `${escapeCsv(entry.Timestamp)},${escapeCsv(entry.Name)},${escapeCsv(entry.Email)},${escapeCsv(entry.University)},${escapeCsv(entry.Branch)},${escapeCsv(entry.Department)},${escapeCsv(entry.SnoxxProject)},${escapeCsv(entry.PublishableProject)}\n`;
            });
            fs.writeFileSync(CSV_FILE, csvContent);
            
            console.log(`[Success] Synced ${submissions.length} submissions from Google Sheets.`);
            return res.json({ success: true, data: submissions });
          } else {
            console.warn('[Warning] Google Sheets script returned error:', result.error);
          }
        } else {
          console.warn(`[Warning] Google Sheets responded with status ${response.status}`);
        }
      } catch (fetchErr) {
        console.error('[Error] Google Sheets fetch failed, using local cache:', fetchErr.message);
      }
    }

    // Fallback to local files if Google Sheets sync is disabled or fails
    const fileData = fs.readFileSync(JSON_FILE, 'utf8');
    const submissions = normalizeSubmissions(JSON.parse(fileData || '[]'));
    return res.json({ success: true, data: submissions });
  } catch (error) {
    console.error('Error fetching submissions:', error);
    return res.status(500).json({ success: false, message: 'Could not retrieve submissions.' });
  }
});

// Route to export/download CSV
app.get('/api/submissions/export', (req, res) => {
  try {
    if (fs.existsSync(CSV_FILE)) {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=snoxx_interns_${new Date().toISOString().split('T')[0]}.csv`);
      return res.sendFile(CSV_FILE);
    } else {
      return res.status(404).json({ success: false, message: 'CSV file not found.' });
    }
  } catch (error) {
    console.error('Error downloading CSV file:', error);
    return res.status(500).json({ success: false, message: 'Error downloading file.' });
  }
});

// Route to clear submissions
app.post('/api/submissions/clear', async (req, res) => {
  try {
    // 1. Clear local cache
    fs.writeFileSync(JSON_FILE, JSON.stringify([]));
    fs.writeFileSync(CSV_FILE, 'Timestamp,Name,Email,University,Branch,Department,SnoxxProject,PublishableProject\n');
    console.log('[Info] Cleared local cache.');

    // 2. Clear Google Sheets if connected
    const scriptUrl = process.env.GOOGLE_SCRIPT_URL;
    if (scriptUrl && scriptUrl.trim() !== '') {
      console.log('[Info] Sending clear command to Google Sheets...');
      try {
        const response = await fetch(scriptUrl.trim(), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ action: 'clear' })
        });
        if (response.ok) {
          const result = await response.json();
          if (result.success) {
            console.log('[Success] Google Sheets database cleared.');
          } else {
            console.warn('[Warning] Google Sheets clear failed:', result.error);
          }
        } else {
          console.warn(`[Warning] Google Sheets clear responded with status ${response.status}`);
        }
      } catch (err) {
        console.error('[Error] Failed to send clear request to Google Sheets:', err.message);
      }
    }

    return res.json({ success: true, message: 'All submissions cleared successfully.' });
  } catch (error) {
    console.error('Error clearing submissions:', error);
    return res.status(500).json({ success: false, message: 'Could not clear submissions.' });
  }
});

// Google Sheets connection status route
app.get('/api/sheets-status', (req, res) => {
  const scriptUrl = process.env.GOOGLE_SCRIPT_URL;
  return res.json({
    success: true,
    connected: !!(scriptUrl && scriptUrl.trim() !== ''),
    url: scriptUrl && scriptUrl.trim() !== '' ? scriptUrl.trim().substring(0, 35) + '...' : null
  });
});

// Start Server
app.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
});
