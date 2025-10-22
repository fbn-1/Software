import express from "express";
import XLSX from "xlsx";

const router = express.Router();

// from excel
router.get("/", async(req, res) => {
  console.log("Reading earnings data from Excel...");
  try {
    const workbook = XLSX.readFile("C:\\Software1\\BloombergEarningsDates.xlsx");

    const sheetName = workbook.SheetNames[0];

    const sheet = workbook.Sheets[sheetName];
 
    const data = XLSX.utils.sheet_to_json(sheet);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// from api




export default router;