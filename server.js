import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import yahooFinance from 'yahoo-finance2';

const app = express();
app.use(cors());
app.disable('etag'); // Kills 304 responses permanently

// 1. LOAD YOUR EXISTING DATA (NO TOUCHING)
function loadYourCSV(symbol) {
    const file = `${symbol}.csv`;
  //  console.log(`Attempting to load CSV for ${symbol} from ${file}`);
    
    if (!fs.existsSync(file)) {
        console.log(`File not found: ${file}`);
        return []; // Return an empty array if the file does not exist
    }
    
    const data = fs.readFileSync(file, 'utf8')
        .split('\n')
        .filter(Boolean) // Filter out empty lines
        .map(line => {
            const [date, price] = line.split(',');
            return { date, price: parseFloat(price) };
        });

    console.log(`Loaded data for ${symbol}:`, data); // Log the loaded data
    return data;
}


// 2. FIND ACTUAL GAPS IN BUSINESS DAYS
function findTrueGaps(existingData) {
    if (existingData.length < 2) return [];
    
    const gaps = [];
    const dateSet = new Set(existingData.map(d => d.date));
    
    // Find earliest and latest dates
    const sorted = [...existingData].sort((a,b) => new Date(a.date) - new Date(b.date));
    const start = new Date(sorted[0].date);
    const end = new Date(sorted[sorted.length - 1].date);
    
    // Check every business day in range
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        if (d.getDay() === 0 || d.getDay() === 6) continue; // Skip weekends
        
        const dateStr = d.toISOString().split('T')[0];
        if (!dateSet.has(dateStr)) {
            gaps.push(dateStr);
        }
    }
    
    return gaps;
}

// 3. FETCH MISSING DAYS (NO FILLERS)
async function fetchGapData(symbol, missingDates) {
    const fetched = [];
    
    for (const dateStr of missingDates) {
        try {
            const date = new Date(dateStr);
            const result = await yahooFinance.historical(symbol, {
                period1: new Date(date.setDate(date.getDate() - 3)), // 3-day window
                period2: dateStr,
                interval: '1d'
            });
            
            const exactMatch = result.find(r => 
                r.date.toISOString().split('T')[0] === dateStr
            );
            
            if (exactMatch) {
                fetched.push({
                    date: dateStr,
                    price: exactMatch.close
                });
            }
        } catch (error) {
            console.log(`[!] Couldn't fetch ${symbol} for ${dateStr}`);
            // LEAVE THE GAP - NO FILLER DATA
        }
    }
    
    return fetched;
}

// 4. UPDATE CSV (APPEND ONLY)
function updateCSV(symbol, newData) {
    if (!newData.length) return;
    
    const file = `${symbol}.csv`;
    const lines = newData.map(d => `${d.date},${d.price}`).join('\n');
    fs.appendFileSync(file, `\n${lines}`);
}

// API ENDPOINT
app.get('/api/quote/:symbol', async (req, res) => {
    const symbol = req.params.symbol.toUpperCase();
    const csvData = loadYourCSV(symbol);
    //console.log(`Serving data for ${symbol}:`, csvData); // Log the data being sent
    res.json({ history: csvData });
});



app.listen(5050, () => console.log('Server ready on port 5050'));