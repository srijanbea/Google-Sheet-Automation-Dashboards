# Content Creators Dashboard
 This is Vibes Coding Project but it will make your daily task so easy !!!
A lightweight analytics dashboard for tracking monthly work done by content creators.

The dashboard reads from a **Google Sheet** (via a small **Google Apps Script JSON API**) and shows:

- Total number of content pieces
- Completed / In Progress / Pending counts
- Detailed content log (date, platform, topic, etc.)

It’s built as a **single static HTML file**, so you can host it on:

- GitHub Pages  
- Cloudflare Pages  
- Any static hosting

---

## Demo Screenshot

> Add this image to your repo (for example: `assets/dashboard-sample.png`) and update the path below.

![Content Creators Dashboard](/dashboard-sample.png)

---

## Features

- 📊 **Key metrics**: Total items, Completed, In Progress, Pending  
- 🧾 **Content log**: All entries pulled from the Google Sheet  
- 🌐 **Google Sheet as database** using Apps Script as a JSON API  
- 📁 **Zero backend**: Just HTML + JS + Google Sheet  
- ☁️ **GitHub / Cloudflare-friendly**: One `index.html` is enough

---

## Tech Stack

- **Frontend**: HTML, CSS, vanilla JavaScript  
- **Backend**: Google Apps Script (serves JSON from Google Sheets)  
- **Data store**: Google Sheets  

---

## Repository Structure

```text
.
├── index.html              # Dashboard UI (static)
├── sample-data.csv         # Example content tracker data
├── assets/
│   └── dashboard-sample.png  # Screenshot for README (optional)
└── apps-script/
    └── Code.gs             # Apps Script: JSON API endpoint
````

* `index.html` – the main dashboard page
* `sample-data.csv` – example rows you can import into a Google Sheet
* `apps-script/Code.gs` – script that exposes the sheet as an API
* `assets/dashboard-sample.png` – screenshot used in this README

---

## Google Sheet Setup

1. Create a new **Google Sheet**.

2. Rename the first tab to: **`ContentTracker`**.

3. Add these **columns in row 1**:

   | Date | Video Type | Location | Topic | Script | Platform | Status | Creator |
   | ---- | ---------- | -------- | ----- | ------ | -------- | ------ | ------- |

4. Add some rows manually or import `sample-data.csv`:

   ```csv
   Date,Video Type,Location,Topic,Script,Platform,Status,Creator
   2025-11-01,Reel 60s,Nepal,IELTS tips for beginners,Provided,Instagram,Completed,Sitashma
   2025-11-01,Info,Aus,189 Skilled Visa overview,Provided,YouTube,In progress,Bibek
   2025-11-02,Q/A Video,Nepal,Master in Australia Q&A,Provided,TikTok,Completed,Sitashma
   2025-11-03,Uni Promo,UK,Study at XYZ University,Provided,All,Pending,Shreya
   2025-11-04,Ads Video,Nepal,IELTS offer campaign,Provided,Facebook,Completed,Bibek
   ```

5. (Optional but recommended) Make sure **Status** values are consistent, for example:

   * `Completed`
   * `In progress`
   * `Pending`

---

## Apps Script: JSON API Setup

This project uses a tiny Apps Script to expose the sheet as JSON.

1. In your Google Sheet, go to **Extensions → Apps Script**.

2. Delete any default code and create a new file `Code.gs` with the following:

   ```js
   /**
    * Web API for Content Tracker sheet.
    * Sheet structure:
    * Date | Video Type | Location | Topic | Script | Platform | Status | Creator
    */

   const SHEET_NAME = 'ContentTracker';

   function doGet(e) {
     const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_NAME);
     const values = sheet.getDataRange().getValues();

     // First row = headers
     const headers = values.shift();
     const data = values
       .filter(row => row[0]) // skip empty date rows
       .map(row => {
         const obj = {};
         headers.forEach((h, i) => obj[h] = row[i]);
         return obj;
       });

     const result = {
       updatedAt: new Date(),
       count: data.length,
       rows: data
     };

     return ContentService
       .createTextOutput(JSON.stringify(result))
       .setMimeType(ContentService.MimeType.JSON);
   }
   ```

3. Click **Deploy → New deployment**.

4. Choose **Web app**:

   * *Execute as*: **Me**
   * *Who has access*: **Anyone with the link**

5. Deploy and copy the **Web app URL** – it will look like:

   ```text
   https://script.google.com/macros/s/XXXXXXXXXXXX/exec
   ```

Keep this URL safe – you’ll put it into `index.html`.

---

## Frontend Setup (index.html)

The dashboard is a single static file that calls the Apps Script API.

In `index.html`, look for:

```js
// TODO: replace with your Apps Script web app URL
const API_URL = "https://SCRIPT_ID_GOES_HERE/exec";
```

Replace it with your real web app URL, for example:

```js
const API_URL = "https://script.google.com/macros/s/XXXXXXXXXXXXXXXX/exec";
```

Now `index.html` will:

* Fetch `JSON` from the Apps Script URL
* Calculate totals and status counts
* Render the content log table

---

## Running Locally

You don’t need any special build tools.

1. Clone the repo:

   ```bash
   git clone https://github.com/your-user/content-creators-dashboard.git
   cd content-creators-dashboard
   ```

2. Open `index.html` in your browser (double-click or `Open With > Browser`).

> Note: Some browsers block `fetch` from local file URLs. If nothing loads, serve it via a simple local server, e.g.:

```bash
# Python 3
python -m http.server 8000
# Then visit: http://localhost:8000/index.html
```

---

## Deploying to GitHub Pages

1. Push this repo to GitHub.
2. Go to **Settings → Pages**.
3. Under “Build and deployment”:

   * Source: **Deploy from a branch**
   * Branch: `main` (or `master`) → `/ (root)`
4. Save.
5. Your dashboard will be available at:

   ```text
   https://your-user.github.io/content-creators-dashboard/
   ```

*(You can do something similar with Cloudflare Pages – just point it at this repo and build nothing.)*

---

## Customisation

* **Styling**
  Edit the `<style>` section in `index.html` to change colors, fonts, or layout.

* **Columns**
  If you add/remove columns in the sheet:

  * Update `sample-data.csv`
  * Make sure the Apps Script `doGet` still maps them correctly
  * Update the table in `index.html` to show/hide those fields

* **Status logic**
  The “Completed / In progress / Pending” logic is handled in JavaScript by comparing text strings.
  You can adjust the categories inside `index.html` if you use different wording.

---

## Roadmap / Ideas

* [ ] Add filters by **month** and **creator**
* [ ] Add charts (e.g. items per creator, items per platform)
* [ ] Add export to CSV from the dashboard
* [ ] Multi-sheet support (one sheet per month)

---

## Contributing

Pull requests are welcome!

* Fork the repo
* Create a feature branch
* Commit your changes
* Open a pull request describing what you improved

---

## License

This project is open source under the **MIT License**.
You’re free to use, modify and share it in your own projects.

---

```

---

If you want, I can also:

- Give you a ready-made **MIT LICENSE** file, and  
- A short `.gitignore` suited for a simple static project.
```
