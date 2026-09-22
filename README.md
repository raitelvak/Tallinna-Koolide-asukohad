# Kõigi Tallinna koolide uuendus

1. Asenda `src/App.jsx`.
2. Lisa `scripts/scrape-all-schools.mjs`.
3. Lisa `.github/workflows/update-all-schools.yml`.
4. Lisa faili `src/styles.css` lõppu `src/styles-additions.css` sisu.
5. Käivita Actions > Update all Tallinn schools > Run workflow.
6. Kontrolli loodud `src/data/schools.json` ja seejärel Pages deploy.

Skript loeb Haridusameti koolide detaillehti, eristab munitsipaal-, riigi- ja erakoole ning geokodeerib aadressid, kui detaillehel ei ole kaardikoordinaate.
