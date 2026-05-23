const urlParams = new URLSearchParams("?mcu=123456789012345&fbclid=abcdefg");
let foundId = null;
for (const val of urlParams.values()) {
    if (/^\d{14,17}$/.test(val)) {
        foundId = val;
        break;
    }
}
console.log(foundId);
