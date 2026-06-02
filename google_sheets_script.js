/**
 * =========================================================================
 * GOOGLE APPS SCRIPT SETUP FOR SNOXX INTERNSHIP FORM
 * =========================================================================
 * 
 * INSTRUCTIONS:
 * 1. Open your Google Sheet where you want to save responses.
 * 2. Create the following headers in row 1 (A1:H1):
 *    Timestamp, Name, Email, University, Branch, Department, SnoxxProject, PublishableProject
 * 3. Go to Extensions -> Apps Script.
 * 4. Delete any code in the editor, and paste this entire file's code.
 * 5. Click "Save" (floppy disk icon).
 * 6. Click "Deploy" (top right) -> "New Deployment".
 * 7. Click the gear icon (Select type) -> select "Web app".
 * 8. Set Configuration:
 *    - Description: "Snoxx Intern Form Handler"
 *    - Execute as: "Me (your email)"
 *    - Who has access: "Anyone" (Required so the backend can send data without OAuth credentials).
 * 9. Click "Deploy". Authorize Google Permissions if prompted.
 * 10. Copy the generated "Web app URL" (looks like: https://script.google.com/macros/s/.../exec).
 * 11. Open your local ".env" file in the backend root and paste the URL:
 *     GOOGLE_SCRIPT_URL=your_copied_web_app_url
 * 12. Restart your Express server!
 * 
 * TROUBLESHOOTING THE "Sorry, unable to open the file at present" ERROR:
 * - If you saw this error when pasting the URL into your browser, don't worry! 
 *   The URL is meant to be called by your server via a POST request, not opened directly. 
 *   We have added a `doGet` handler below to show a friendly success message if visited directly.
 * - If you saw this error when trying to open "Extensions -> Apps Script" on Google Sheets:
 *   Google has a known issue when you are logged into multiple Google accounts in the same browser. 
 *   Open your Google Sheet in an **Incognito / Private Window** and try opening Apps Script again.
 * =========================================================================
 */

// Handles GET requests (e.g. fetching all submissions)
function doGet(e) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var lastRow = sheet.getLastRow();
    
    // If sheet is empty or only has headers
    if (lastRow <= 1) {
      return ContentService.createTextOutput(JSON.stringify({ 
        success: true, 
        data: [] 
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    var rows = sheet.getDataRange().getValues();
    var headers = rows[0];
    var data = [];
    
    for (var i = 1; i < rows.length; i++) {
      var row = rows[i];
      var record = {};
      for (var j = 0; j < headers.length; j++) {
        var val = row[j];
        // Format Date to India timezone string
        if (headers[j] === "Timestamp" && val instanceof Date) {
          record[headers[j]] = Utilities.formatDate(val, "GMT+5:30", "M/d/yyyy, h:mm:ss a");
        } else {
          record[headers[j]] = val;
        }
      }
      data.push(record);
    }
    
    return ContentService.createTextOutput(JSON.stringify({ 
      success: true, 
      data: data 
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ 
      success: false, 
      error: err.toString() 
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// Handles POST requests (called by your backend server to insert new rows or clear data)
function doPost(e) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    
    // 2. Parse incoming JSON submission payload
    var data = JSON.parse(e.postData.contents);
    
    // Check if the action is to clear the database
    if (data.action === "clear") {
      var lastRow = sheet.getLastRow();
      if (lastRow > 1) {
        sheet.deleteRows(2, lastRow - 1);
      }
      return ContentService.createTextOutput(JSON.stringify({ 
        success: true, 
        message: "Google Sheet cleared successfully." 
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // 3. Append the record to the sheet
    sheet.appendRow([
      data.Timestamp,
      data.Name,
      data.Email,
      data.University,
      data.Branch,
      data.Department,
      data.SnoxxProject,
      data.PublishableProject
    ]);
    
    // 4. Return success response
    return ContentService.createTextOutput(JSON.stringify({ 
      success: true, 
      message: "Row added to Google Sheet successfully." 
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (err) {
    // Return error message if sync fails
    return ContentService.createTextOutput(JSON.stringify({ 
      success: false, 
      error: err.toString() 
    })).setMimeType(ContentService.MimeType.JSON);
  }
}
