const fs = require('fs');
const path = require('path');
const DATA_PATH = path.join(__dirname, 'data', 'films.json');
(async function(){
  try{
    const txt = await fs.promises.readFile(DATA_PATH, 'utf8');
    const arr = JSON.parse(txt || '[]');
    let changed = false;
    const cleaned = arr.map(item => {
      if (item && item.hasOwnProperty('deleted')) {
        const copy = Object.assign({}, item);
        delete copy.deleted;
        changed = true;
        return copy;
      }
      return item;
    });
    if (changed) {
      await fs.promises.writeFile(DATA_PATH, JSON.stringify(cleaned, null, 2), 'utf8');
      console.log('Cleared deleted flags from', cleaned.length, 'items.');
    } else {
      console.log('No deleted flags found.');
    }
  } catch (e) {
    console.error('Error:', e && e.message ? e.message : e);
    process.exit(1);
  }
})();
