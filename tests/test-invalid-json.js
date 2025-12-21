import http from 'http';

const serverUrl = 'http://localhost:5000/message';

function testMalformedJson() {
    const data = '{ "invalid": json '; // Malformed JSON
    const options = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': data.length,
        },
    };

    console.log(`Sending malformed JSON to ${serverUrl}...`);
    const req = http.request(serverUrl, options, (res) => {
        let body = '';
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => {
            console.log(`Status: ${res.statusCode}`);
            console.log(`Response: ${body}`);
            if (res.statusCode === 400) {
                console.log('✅ Test passed: Received 400 Bad Request');
                try {
                    const json = JSON.parse(body);
                    if (json.error.code === -32700) {
                        console.log('✅ Test passed: Received correct RPC error code');
                    } else {
                        console.error('❌ Test failed: Incorrect RPC error code');
                    }
                } catch (e) {
                    console.error('❌ Test failed: Response was not valid JSON');
                }
            } else {
                console.error(`❌ Test failed: Expected 400, got ${res.statusCode}`);
            }
            process.exit(res.statusCode === 400 ? 0 : 1);
        });
    });

    req.on('error', (e) => {
        console.error(`❌ Request failed: ${e.message}`);
        console.log('Note: Ensure the Kanka server is running on port 5000 before running this test.');
        process.exit(1);
    });

    req.write(data);
    req.end();
}

testMalformedJson();
