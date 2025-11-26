const fs = require('fs').promises;
const path = require('path');

async function fetchPage(apiKey, page) {
  const url = `https://api.themoviedb.org/3/movie/popular?api_key=${apiKey}&language=en-US&page=${page}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`TMDB page ${page} error ${res.status}`);
  return res.json();
}

async function main() {
  const apiKey = process.argv[2] || process.env.TMDB_API_KEY;
  if (!apiKey) {
    console.error('Usage: node fetch_tmdb.js <API_KEY>');
    process.exit(2);
  }

  const movies = [];
  try {
    for (let page = 1; page <= 10; page++) {
      console.log('Fetching TMDB page', page);
      const data = await fetchPage(apiKey, page);
      if (Array.isArray(data.results)) {
        for (const m of data.results) {
          movies.push({
            _id: String(m.id),
            id: m.id,
            title: m.title,
            overview: m.overview,
            poster_path: m.poster_path,
            release_date: m.release_date,
            vote_average: m.vote_average
          });
        }
      }
      // small delay to be polite
      await new Promise(r => setTimeout(r, 200));
    }

    const outPath = path.join(__dirname, 'data', 'films.json');
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, JSON.stringify(movies.slice(0,200), null, 2), 'utf8');
    console.log('Wrote', Math.min(movies.length,200), 'movies to', outPath);
  } catch (err) {
    console.error('Error fetching TMDB:', err.message || err);
    process.exit(1);
  }
}

main();
