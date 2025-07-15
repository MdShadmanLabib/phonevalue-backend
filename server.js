/*
* =======================================================================
* PhoneValue - Back-End Quote Engine
* =======================================================================
*
* Description:
* This is a Node.js server using the Express framework. Its main job is
* to receive a device's details (brand, model, storage, condition) from
* the front-end, scrape live prices from competitor websites, and then
* calculate and return a final quote.
*
* Key Technologies:
* - Node.js: The JavaScript runtime environment.
* - Express: A web server framework for Node.js to handle requests.
* - Cheerio: A library that makes it easy to search and pull data from
* HTML, just like jQuery. We use it for web scraping.
* - node-fetch: A library to make web requests to get the HTML from
* competitor sites.
* - cors: A package to allow our front-end (on a different URL) to
* talk to this back-end server securely.
*
* How to Run This Locally:
* 1. Make sure you have Node.js installed on your computer.
* 2. Create a folder for this project.
* 3. Save this file as 'server.js' inside that folder.
* 4. Create a 'package.json' file (see guide).
* 5. Open a terminal/command prompt in the folder.
* 6. Run 'npm install' to download the necessary packages.
* 7. Run 'node server.js' to start the server.
*
*/

// --- 1. Import necessary packages ---
const express = require('express');
const fetch = require('node-fetch'); // Using node-fetch v2 for compatibility with Vercel's environment
const cheerio = require('cheerio');
const cors = require('cors');

// --- 2. Setup the Express App ---
const app = express();
const PORT = process.env.PORT || 3001; // Use Vercel's port or 3001 for local testing

// --- 3. Middleware ---
app.use(cors()); // Allow requests from our front-end website
app.use(express.json()); // Allow the server to understand JSON data sent from the front-end

// --- 4. The Main API Endpoint ---
// This is the URL our front-end will call: /api/get-quote
app.post('/api/get-quote', async (req, res) => {
    console.log('Received a quote request...');

    // Get the device details sent from the front-end
    const { brand, model, storage, condition } = req.body;

    // Basic validation: make sure we received the data we need
    if (!brand || !model || !storage || !condition) {
        console.error('Validation failed: Missing data from front-end.');
        return res.status(400).json({ error: 'Please provide all device details.' });
    }

    console.log(`Scraping for: ${brand} ${model} ${storage}`);

    try {
        // --- Scrape Competitor Prices in Parallel ---
        // We ask for both prices at the same time to be faster.
        const [cexPrice, musicMagpiePrice] = await Promise.all([
            getCeXPrice(model, storage),
            getMusicMagpiePrice(brand, model, storage)
        ]);
        
        console.log(`Scraped Prices -> CEX: £${cexPrice}, MusicMagpie: £${musicMagpiePrice}`);

        // --- Calculate Our Quote ---
        // Find the highest price offered by a competitor
        const highestCompetitorPrice = Math.max(cexPrice, musicMagpiePrice);

        // If no competitor has a price, we can't make an offer
        if (highestCompetitorPrice <= 0) {
            console.log('No competitor prices found. Cannot generate quote.');
            return res.json({
                ourPrice: 0,
                cexPrice: cexPrice,
                musicMagpiePrice: musicMagpiePrice,
                message: "Sorry, we couldn't find a price for this model right now."
            });
        }

        // Apply condition logic (this should mirror the front-end logic but with real prices)
        let basePrice = highestCompetitorPrice;
        basePrice -= (4 - parseInt(condition.screen_condition)) * (basePrice * 0.15);
        basePrice -= (4 - parseInt(condition.body_condition)) * (basePrice * 0.1);
        if (!condition.fully_functional) basePrice *= 0.4;
        if (!condition.camera_works) basePrice *= 0.8;
        if (!condition.battery_health) basePrice *= 0.9;
        if (condition.original_box) basePrice += 10;
        if (condition.charger_included) basePrice += 5;

        // Our final offer is a bit more than the highest competitor price
        const finalOffer = Math.round(basePrice) + (Math.floor(Math.random() * 25) + 5); // Add £5-£30

        console.log(`Final Offer: £${finalOffer}`);

        // --- Send the data back to the front-end ---
        res.json({
            ourPrice: finalOffer,
            cexPrice: cexPrice,
            musicMagpiePrice: musicMagpiePrice
        });

    } catch (error) {
        console.error('An error occurred during the quote process:', error);
        res.status(500).json({ error: 'An internal server error occurred.' });
    }
});

// --- 5. Scraper Functions ---

/**
 * Scrapes the price for a device from the CEX (uk.webuy.com) website.
 * NOTE: Web scraping is fragile. If CEX changes their website structure,
 * this function will need to be updated.
 */
async function getCeXPrice(model, storage) {
    try {
        // Format the search query for the CEX URL
        const searchQuery = `${model} ${storage}`.replace(/ /g, '+');
        const url = `https://uk.webuy.com/search?stext=${searchQuery}`;

        const response = await fetch(url);
        const html = await response.text();
        const $ = cheerio.load(html);

        // Find the first search result item and get its price
        // CEX uses a 'data-gtm-price' attribute on the selling price element
        const priceText = $('.sell-price .price-info-row .price-info-val .price').first().text();

        if (priceText) {
            // The text is like "£123.00". We need to remove the '£' and convert to a number.
            const price = parseFloat(priceText.replace('£', ''));
            return isNaN(price) ? 0 : price;
        }
        return 0; // Return 0 if not found
    } catch (error) {
        console.error('Error scraping CEX:', error.message);
        return 0; // Return 0 on error
    }
}

/**
 * Scrapes the price for a device from MusicMagpie.
 * NOTE: This is a simplified example. MusicMagpie has a more complex
 * multi-step process which can be harder to scrape reliably.
 */
async function getMusicMagpiePrice(brand, model, storage) {
     try {
        // MusicMagpie's search is also URL-based
        const searchQuery = `${brand} ${model} ${storage}`.replace(/ /g, '%20');
        const url = `https://www.musicmagpie.co.uk/sell-mobile-phones/search/?keyword=${searchQuery}`;
        
        const response = await fetch(url);
        const html = await response.text();
        const $ = cheerio.load(html);

        // Find the price element. Their structure might be like this:
        const priceText = $('.product-price-now').first().text().trim();

        if (priceText) {
            const price = parseFloat(priceText.replace('£', ''));
            return isNaN(price) ? 0 : price;
        }
        return 0;
    } catch (error) {
        console.error('Error scraping MusicMagpie:', error.message);
        return 0;
    }
}


// --- 6. Start the Server ---
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

// This makes the app work on Vercel
module.exports = app;
