# QR Code Generator

> Hacking `qrCodeSVG` in BOT Frame 😎

## Input

<div style="text-align:center;">
<textarea id="qrCodeText" rows="5" style="width:80%" oninput="document.getElementById('qrCodeCanvas').innerHTML = qrCodeSVG(this.value, 320);"></textarea>
</div>

## Output

<div style="margin:0 auto;width:50%">
<p id="qrCodeCanvas" style="text-align:center;">
    Generate QR Code here 🙃
</p>
<p style="text-align:center;">
    <em>qrcode.js</em> by
    <a href="https://github.com/kazuhikoarase/qrcode-generator">
        kazuhikoarase
    </a>
</p>
</div>

<script>
if (location.search.indexOf('text') != -1) {
    search = location.search.substring(1);
    var pairs = search.split("&");
    for (var i = 0; i < pairs.length; i++) {
        var kv = pairs[i].split("=");
        if (kv[0] === "text" && kv[1]) {
            document.getElementById('qrCodeCanvas').innerHTML = qrCodeSVG(decodeURIComponent(kv[1]), 320);
            break;
        }
    }
}
</script>
