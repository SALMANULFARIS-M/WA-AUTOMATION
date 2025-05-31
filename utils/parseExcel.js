import xlsx from "xlsx";

function parseExcel(filePath) {
  const workbook = xlsx.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rawData = xlsx.utils.sheet_to_json(sheet);

  const numbers = rawData
    .map((row) => {
      const val = Object.values(row).find(v =>
        typeof v === 'string' || typeof v === 'number'
      );
      return val || "";
    })
    .filter(Boolean)
    .map((n) => {
      n = n.toString().replace(/\D/g, "");
      if (!n.startsWith("91")) n = "91" + n;
      return "+" + n;
    });

  console.log("Parsed Numbers:", numbers.length);
  return numbers;
}

export default parseExcel;