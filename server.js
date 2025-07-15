/*
* =======================================================================
* PhoneValue - Back-End Quote Engine (v3 - Robust)
* =======================================================================
*
* Description:
* This version is significantly more robust. It includes better error
* handling within the scrapers to prevent server crashes. If a scraper
* fails to find a price, it will log the error and return 0 instead of
* crashing the Vercel function. It also uses a User-Agent header to
* appear more like a legitimate browser.
*
*/

// --- 1. Import necessary packages ---
const express = require('express');
const fetch = require('node-fetch'); // Using node-fetch v2 for CommonJS
const cheerio = require('cheerio');
const cors = require('cors');

// --- 2. Setup the Express App ---
const app = express();
const PORT = process.env.PORT || 3001;

// --- 3. Middleware ---
app.use(cors());
app.use(express.json());

// --- 4. The Main API Endpoint ---
app.post('/api/get-quote', async (req, res) => {
    console.log('Received a quote request...');

    const { brand, model, storage, grade } = req.body;

    if (!brand || !model || !storage || !grade) {
        console.error('Validation failed: Missing data.', req.body);
        return res.status(400).json({ error: 'Please provide all device details, including grade.' });
    }

    console.log(`Scraping for: ${grade} Grade ${brand} ${model} ${storage}`);

    try {
        const [cexPrice, musicMagpiePrice] = await Promise.all([
            getCeXPrice(model, storage, grade),
            getMusicMagpiePrice(brand, model, storage)
        ]);
        
        console.log(`Scraped Prices -> CEX: £${cexPrice}, MusicMagpie: £${musicMagpiePrice}`);

        const highestCompetitorPrice = Math.max(cexPrice, musicMagpiePrice);

        if (highestCompetitorPrice <= 0) {
            console.log('No competitor prices found.');
            return res.json({
                ourPrice: 0,
                cexPrice: cexPrice,
                musicMagpiePrice: musicMagpiePrice,
                message: "Sorry, we couldn't find a price for this model right now."
            });
        }

        const basePrice = highestCompetitorPrice;
        const finalOffer = Math.round(basePrice) + (Math.floor(Math.random() * 25) + 5);

        console.log(`Final Offer: £${finalOffer}`);

        res.json({
            ourPrice: finalOffer,
            cexPrice: cexPrice,
            musicMagpiePrice: musicMagpiePrice
        });

    } catch (error) {
        console.error('An unexpected error occurred in the main endpoint:', error);
        res.status(500).json({ error: 'An internal server error occurred.' });
    }
});

// --- 5. Scraper Functions ---

async function getCeXPrice(model, storage, grade) {
    try {
        // CEX uses grade letters in search. Let's make the search very specific.
        // Example: "iPhone 14 Pro 128GB Unlocked A"
        const searchQuery = `${model} ${storage} Unlocked ${grade}`.replace(/ /g, '+');
        const url = `https://uk.webuy.com/search?stext=${searchQuery}`;
        
        console.log(`Scraping CEX URL: ${url}`);

        const response = await fetch(url, {
            headers: { // Act like a real browser to avoid being blocked
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36'
            }
        });
        
        if (!response.ok) {
            console.error(`CEX returned a non-200 status: ${response.status}`);
            return 0;
        }

        const html = await response.text();
        const $ = cheerio.load(html);

        // Find the "WeBuy for £..." price in the first search result.
        const firstResult = $('.product-box-container').first();
        if (firstResult.length === 0) {
            console.log(`CEX: No product box found for query: ${searchQuery}`);
            return 0;
        }

        const priceText = firstResult.find('.sell-price .price').text();
        if (priceText) {
            // This regex removes the '£' and any commas, then converts to a number.
            const price = parseFloat(priceText.replace(/[^0-9.-]+/g,""));
            console.log(`CEX Found Price: £${price}`);
            return isNaN(price) ? 0 : price;
        }
        
        console.log(`CEX: Price element not found in product box for: ${searchQuery}`);
        return 0;
    } catch (error) {
        console.error('Error during CEX scrape:', error.message);
        return 0; // Return 0 on error to prevent crashing
    }
}

async function getMusicMagpiePrice(brand, model, storage) {
     try {
        const searchQuery = `${brand} ${model} ${storage}`.replace(/ /g, '%20');
        const url = `https://www.musicmagpie.co.uk/sell-mobile-phones/search/?keyword=${searchQuery}`;
        
        console.log(`Scraping MusicMagpie URL: ${url}`);

        const response = await fetch(url, {
             headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36'
            }
        });
        const html = await response.text();
        const $ = cheerio.load(html);

        // Find the price element from the first result.
        const priceText = $('.product-price-now').first().text().trim();

        if (priceText) {
            const price = parseFloat(priceText.replace(/[^0-9.-]+/g,""));
            console.log(`MusicMagpie Found Price: £${price}`);
            return isNaN(price) ? 0 : price;
        }
        
        console.log(`MusicMagpie: Price element not found for: ${searchQuery}`);
        return 0;
    } catch (error) {
        console.error('Error during MusicMagpie scrape:', error.message);
        return 0; // Return 0 on error to prevent crashing
    }
}


// --- 6. Start the Server ---
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

// This makes the app work on Vercel
module.exports = app;
