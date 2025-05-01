import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';

// Constants
const POLYGON_API_KEY = 'YOUR_POLYGON_API_KEY'; // Replace with your Polygon.io API key
const STOCKS = ['NFLX', 'APH', 'COST', 'GOOG']; // List of stocks to monitor
const DATA_DIR = './'; // Directory where CSV files are stored
const API_RATE_LIMIT = 15000; // 15 seconds in milliseconds

// Helper Functions
function loadCSV(symbol) {
    const filePath = path.join(DATA_DIR, `${symbol}.csv`);
    if (!fs.existsSync(filePath)) return [];
    return fs.readFileSync(filePath, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map(line => {
            const [date, price] = line.split(',');
            return { date, price: parseFloat(price) };
        });
}

function saveCSV(symbol, data) {
    const filePath = path.join(DATA_DIR, `${symbol}.csv`);
    const lines = data.map(entry => `${entry.date},${entry.price}`);
    fs.writeFileSync(filePath, lines.join('\n'));
}

async function fetchPolygonData(symbol, date) {
    try {
        const url = `https://api.polygon.io/v1/open-close/${symbol}/${date}?apiKey=${POLYGON_API_KEY}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Polygon API error: ${response.statusText}`);
        const data = await response.json();
        return data.close;
    } catch (error) {
        console.error(`[!] Failed to fetch data for ${symbol} on ${date}: ${error.message}`);
        return null;
    }
}

function getPreviousBusinessDay(date) {
    let d = new Date(date);
    while (d.getDay() === 0 || d.getDay() === 6) { // Skip Sundays (0) and Saturdays (6)
        d.setDate(d.getDate() - 1); // Step back to the previous day
    }
    return d.toISOString().split('T')[0];
}

function getLastNBusinessDays(n) {
    const businessDays = [];
    let currentDate = new Date(); // Start with today
    while (businessDays.length < n) { // Collect exactly n business days
        const dateStr = getPreviousBusinessDay(currentDate.toISOString().split('T')[0]);
        if (!businessDays.includes(dateStr)) { // Ensure no duplicates
            businessDays.push(dateStr);
        }
        currentDate = new Date(dateStr); // Step back for the next loop
    }
    return businessDays;
}


// Adjusted Continuous Monitoring Logic
async function monitorStocks() {
    console.log('Starting stock CSV verification...');
    
    while (true) {
        for (const symbol of STOCKS) {
            console.log(`\n[Checking ${symbol}]`);
            
            const csvData = loadCSV(symbol);
            const lastBusinessDays = getLastNBusinessDays(15); // Only business days

            let updated = false;

            for (const businessDay of lastBusinessDays) {
                const existingEntry = csvData.find(entry => entry.date === businessDay);
                if (existingEntry) {
                    console.log(`Verified: ${symbol} on ${businessDay} - ${existingEntry.price}`);
                    continue;
                }

                // Fetch missing data from Polygon.io
                console.log(`Missing data for ${symbol} on ${businessDay}. Fetching...`);
                const closePrice = await fetchPolygonData(symbol, businessDay);
                if (closePrice !== null) {
                    csvData.push({ date: businessDay, price: closePrice });
                    console.log(`Updated: ${symbol} on ${businessDay} - ${closePrice}`);
                    updated = true;
                }

                // Wait 15 seconds to respect API rate limit
                console.log('Waiting 15 seconds...');
                await new Promise(resolve => setTimeout(resolve, API_RATE_LIMIT));
            }

            // Sort and save updated CSV
            if (updated) {
                csvData.sort((a, b) => new Date(a.date) - new Date(b.date));
                saveCSV(symbol, csvData);
                console.log(`CSV for ${symbol} updated.`);
            } else {
                console.log(`No updates needed for ${symbol}.`);
            }
        }
    }
}

// Start the monitor
monitorStocks().catch(error => console.error('Error in monitorStocks:', error.message));
