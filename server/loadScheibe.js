import mysql from "mysql2/promise";

/**
 * @param {import('mysql2/promise').Pool} pool
 * @param {string|number} id
 */
export async function loadScheibeDetail(pool, id) {
  const [[scheibe]] = await pool.query(
    `SELECT * FROM Scheiben WHERE ScheibenID = ?`,
    [id]
  );
  if (!scheibe) return null;
  const [serien] = await pool.query(
    `SELECT ScheibenID, Stellung, Serie, Ring, Ring01
     FROM Serien WHERE ScheibenID = ?
     ORDER BY Stellung, Serie`,
    [id]
  );
  const [treffer] = await pool.query(
    `SELECT ScheibenID, Stellung, Treffer, x, y, Innenzehner,
            Ring, Ring01, Teiler01, Zeitstempel
     FROM Treffer WHERE ScheibenID = ?
     ORDER BY Stellung, Treffer`,
    [id]
  );
  return { scheibe, serien, treffer };
}
