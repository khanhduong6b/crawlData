const puppeteer = require("puppeteer");
const fs = require("fs").promises;
const path = require("path");
const process = require("process");
const { authenticate } = require("@google-cloud/local-auth");
const { google } = require("googleapis");
const express = require("express");
const app = express();

let currentStock;

app.use(express.json());
// If modifying these scopes, delete token.json.
const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];
// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.
const TOKEN_PATH = path.join(process.cwd(), "token.json");
const CREDENTIALS_PATH = path.join(process.cwd(), "credentials.json");

/**
 * Reads previously authorized credentials from the save file.
 *
 * @return {Promise<OAuth2Client|null>}
 */
async function loadSavedCredentialsIfExist() {
  try {
    const content = await fs.readFile(TOKEN_PATH);
    const credentials = JSON.parse(content);
    return google.auth.fromJSON(credentials);
  } catch (err) {
    return null;
  }
}

/**
 * Serializes credentials to a file comptible with GoogleAUth.fromJSON.
 *
 * @param {OAuth2Client} client
 * @return {Promise<void>}
 */
async function saveCredentials(client) {
  const content = await fs.readFile(CREDENTIALS_PATH);
  const keys = JSON.parse(content);
  const key = keys.installed || keys.web;
  const payload = JSON.stringify({
    type: "authorized_user",
    client_id: key.client_id,
    client_secret: key.client_secret,
    refresh_token: client.credentials.refresh_token,
  });
  await fs.writeFile(TOKEN_PATH, payload);
}

/**
 * Load or request or authorization to call APIs.
 *
 */
async function authorize() {
  let client = await loadSavedCredentialsIfExist();
  if (client) {
    return client;
  }
  client = await authenticate({
    scopes: SCOPES,
    keyfilePath: CREDENTIALS_PATH,
  });
  if (client.credentials) {
    await saveCredentials(client);
  }
  return client;
}
/**
 * Prints the names and majors of students in a sample spreadsheet:
 * @see https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit
 * @param {google.auth.OAuth2} auth The authenticated Google OAuth client.
 */
async function listMajors(auth) {
  const sheets = google.sheets({ version: "v4", auth });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: "1TuyI1FHNJRB-_6nnEg0s6Ki6AbptXCNQEDOM8iNLXE4",
    range: "DataChungKhoan!A1",
  });
  return res.data.values.toString();
}

async function main() {
  currentStock = await authorize().then(listMajors).catch(console.error);
  switch (currentStock) {
    case "HOSE":
      await authorize().then(updateDataHose).catch(console.error);
      break;
    case "UPCOM":
      await authorize().then(updateDataUpcom).catch(console.error);
      break;
    case "HNX":
      await authorize().then(updateDataHnx).catch(console.error);
      break;
  }
}
main();

const { Configuration, OpenAIApi } = require("openai");
const dotenv = require("dotenv");
dotenv.config({ override: true });

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

//write function update data to google sheet when user order products (all products store in google sheet are record, column[7] is quantity of product, when user order product, quantity of product will be decrease 1)
async function updateDataHose(auth) {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  let obj = [];
  await page.goto("https://vn.investing.com/indices/vn-historical-data");

  const elements = await page.$$('[class="datatable_row__qHMpQ"]');

  const data = await Promise.all(
    elements.map((element) => element.evaluate((node) => node.textContent))
  );

  for (let i = 1; i < 23; i++) {
    let inputString = data.at(i);
    const values = [
      inputString.substring(0, 10),
      parseFloat(inputString.substring(10, 18).replace(",", "")),
      parseFloat(inputString.substring(18, 26).replace(",", "")),
      parseFloat(inputString.substring(26, 34).replace(",", "")),
      parseFloat(inputString.substring(34, 42).replace(",", "")),
      inputString.substring(42, inputString.length - 6),
      inputString.substring(inputString.length - 6),
    ];
    obj.push(values);
  }
  await browser.close();
  const completion = await openai.createChatCompletion({
    model: "gpt-3.5-turbo",
    messages: [
      {
        role: "system",
        content:
          "Act as a Financial Analyst for analyzing finance data (OHLCV). I will provide you data (format Date, Close, Open, High, Close, Volume) about the stock market and you will only give me 1 answer about the guess the price will increase or decrease in the next 5-10 days (you only use Bollinger Band). Do not write explanations in replies. If you can guess, you can give me your guess 'Icrease' or 'Decrease'",
      },
      {
        role: "assistant",
        content: obj.toString(),
      },
    ],
  });
  let recommend = [];
  recommend.push(completion.data.choices[0].message.content);
  const sheets = google.sheets({ version: "v4", auth });
  const res = sheets.spreadsheets.values.update({
    spreadsheetId: "1TuyI1FHNJRB-_6nnEg0s6Ki6AbptXCNQEDOM8iNLXE4",
    range: "DataChungKhoan!A3:G",
    valueInputOption: "RAW",
    requestBody: {
      values: obj,
    },
  });

  sheets.spreadsheets.values.update({
    spreadsheetId: "1TuyI1FHNJRB-_6nnEg0s6Ki6AbptXCNQEDOM8iNLXE4",
    range: "DataChungKhoan!I22",
    valueInputOption: "RAW",
    requestBody: {
      values: [recommend],
    },
  });
  sheets.spreadsheets.values.update({
    spreadsheetId: "1TuyI1FHNJRB-_6nnEg0s6Ki6AbptXCNQEDOM8iNLXE4",
    range: "DataChungKhoan!I23",
    valueInputOption: "RAW",
    requestBody: {
      values: [
        [
          completion.data.choices[0].message.content == "Increase"
            ? "Sell"
            : "Buy",
        ],
      ],
    },
  });
  return res;
}

async function updateDataHnx(auth) {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  let obj = [];
  await page.goto("https://vn.investing.com/indices/hnx-historical-data");

  const elements = await page.$$('[class="datatable_row__qHMpQ"]');

  const data = await Promise.all(
    elements.map((element) => element.evaluate((node) => node.textContent))
  );

  for (let i = 1; i < 23; i++) {
    let inputString = data.at(i);
    const values = [
      inputString.substring(0, 10),
      parseFloat(inputString.substring(10, 16).replace(",", "")),
      parseFloat(inputString.substring(16, 22).replace(",", "")),
      parseFloat(inputString.substring(22, 28).replace(",", "")),
      parseFloat(inputString.substring(28, 34).replace(",", "")),
      inputString.substring(34, inputString.length - 6),
      inputString.substring(inputString.length - 6),
    ];
    obj.push(values);
  }
  await browser.close();
  const completion = await openai.createChatCompletion({
    model: "gpt-3.5-turbo",
    messages: [
      {
        role: "system",
        content:
          "Act as a Financial Analyst for analyzing finance data (OHLCV). I will provide you data (format Date, Close, Open, High, Close, Volume) about the stock market and you will only give me 1 answer about the guess the price will increase or decrease in the next 5-10 days (you only use Bollinger Band). Do not write explanations in replies. If you can guess, you can give me your guess'Icrease' or 'Decrease'",
      },
      {
        role: "assistant",
        content: obj.toString(),
      },
    ],
  });
  let recommend = [];
  recommend.push(completion.data.choices[0].message.content);
  const sheets = google.sheets({ version: "v4", auth });
  const res = sheets.spreadsheets.values.update({
    spreadsheetId: "1TuyI1FHNJRB-_6nnEg0s6Ki6AbptXCNQEDOM8iNLXE4",
    range: "DataChungKhoan!A3:G",
    valueInputOption: "RAW",
    requestBody: {
      values: obj,
    },
  });
  sheets.spreadsheets.values.update({
    spreadsheetId: "1TuyI1FHNJRB-_6nnEg0s6Ki6AbptXCNQEDOM8iNLXE4",
    range: "DataChungKhoan!I22",
    valueInputOption: "RAW",
    requestBody: {
      values: [recommend],
    },
  });
  sheets.spreadsheets.values.update({
    spreadsheetId: "1TuyI1FHNJRB-_6nnEg0s6Ki6AbptXCNQEDOM8iNLXE4",
    range: "DataChungKhoan!I23",
    valueInputOption: "RAW",
    requestBody: {
      values: [
        [
          completion.data.choices[0].message.content == "Increase"
            ? "Sell"
            : "Buy",
        ],
      ],
    },
  });

  return res;
}

async function updateDataUpcom(auth) {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  let obj = [];
  await page.goto(
    "https://vn.investing.com/indices/unlisted-public-company-market-historical-data"
  );

  const elements = await page.$$('[class="datatable_row__qHMpQ"]');

  const data = await Promise.all(
    elements.map((element) => element.evaluate((node) => node.textContent))
  );

  for (let i = 1; i < 23; i++) {
    let inputString = data.at(i);
    const values = [
      inputString.substring(0, 10),
      parseFloat(inputString.substring(10, 15).replace(",", "")),
      parseFloat(inputString.substring(15, 20).replace(",", "")),
      parseFloat(inputString.substring(20, 25).replace(",", "")),
      parseFloat(inputString.substring(25, 30).replace(",", "")),
      inputString.substring(30, inputString.length - 6),
      inputString.substring(inputString.length - 6),
    ];
    obj.push(values);
  }
  await browser.close();
  const completion = await openai.createChatCompletion({
    model: "gpt-3.5-turbo",
    messages: [
      {
        role: "system",
        content:
          "Act as a Financial Analyst for analyzing finance data (OHLCV). I will provide you data (format Date, Close, Open, High, Close, Volume) about the stock market and you will only give me 1 answer about the guess the price will increase or decrease in the next 5-10 days (you only use Bollinger Band). Do not write explanations in replies. If you can guess, you can give me your guess'Icrease' or 'Decrease'",
      },
      {
        role: "assistant",
        content: obj.toString(),
      },
    ],
  });
  let recommend = [];
  recommend.push(completion.data.choices[0].message.content);
  const sheets = google.sheets({ version: "v4", auth });
  const res = sheets.spreadsheets.values.update({
    spreadsheetId: "1TuyI1FHNJRB-_6nnEg0s6Ki6AbptXCNQEDOM8iNLXE4",
    range: "DataChungKhoan!A3:G",
    valueInputOption: "RAW",
    requestBody: {
      values: obj,
    },
  });
  sheets.spreadsheets.values.update({
    spreadsheetId: "1TuyI1FHNJRB-_6nnEg0s6Ki6AbptXCNQEDOM8iNLXE4",
    range: "DataChungKhoan!I22",
    valueInputOption: "RAW",
    requestBody: {
      values: [recommend],
    },
  });
  sheets.spreadsheets.values.update({
    spreadsheetId: "1TuyI1FHNJRB-_6nnEg0s6Ki6AbptXCNQEDOM8iNLXE4",
    range: "DataChungKhoan!I23",
    valueInputOption: "RAW",
    requestBody: {
      values: [
        [
          completion.data.choices[0].message.content == "Increase"
            ? "Sell"
            : "Buy",
        ],
      ],
    },
  });

  return res;
}

app.use("/hose", async (req, res) => {
  currentStock = "HOSE";
  await authorize().then(updateDataHose).catch(console.error);
  res.json("success");
});

app.use("/hnx", async (req, res) => {
  currentStock = "HNX";
  await authorize().then(updateDataHnx).catch(console.error);
  res.json("success");
});

app.use("/upcom", async (req, res) => {
  currentStock = "UPCOM";
  await authorize().then(updateDataUpcom).catch(console.error);
  res.json("success");
});

const cron = require("node-cron");

// Schedule the method to run every 24 hours
cron.schedule("0 0 * * *", async () => {
  console.log("update");
  currentStock = await authorize().then(listMajors).catch(console.error);
  switch (currentStock) {
    case "HOSE":
      await authorize().then(updateDataHose).catch(console.error);
      break;
    case "UPCOM":
      await authorize().then(updateDataUpcom).catch(console.error);
      break;
    case "HNX":
      await authorize().then(updateDataHnx).catch(console.error);
      break;
  }
});

const job = cron.schedule("*/15 * * * * *", async () => {
  const newStock = await authorize().then(listMajors).catch(console.error);
  if (currentStock != newStock) {
    currentStock = newStock;
    switch (newStock) {
      case "HOSE":
        await authorize().then(updateDataHose).catch(console.error);
        break;
      case "UPCOM":
        await authorize().then(updateDataUpcom).catch(console.error);
        break;
      case "HNX":
        await authorize().then(updateDataHnx).catch(console.error);
        break;
    }
  }
});

job.start();

app.listen(3000, () => console.log("Server Started"));
