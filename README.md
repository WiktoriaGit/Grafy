# GraphLab

Interaktywna wizualizacja i analiza algorytmów grafowych (praca inżynierska).

## Uruchomienie

```powershell
cd "C:\Users\wikaf\OneDrive\Desktop\graphlab"
npm install
npm run dev
```

Aplikacja: [http://localhost:5173](http://localhost:5173)

## Testy i build

```powershell
npm test
npm run build
```

## Eksperymenty i badania porównawcze

W zakładce **Eksperymenty** dostępne są dwa tryby:

1. **Pojedynczy eksperyment** — dotychczasowy benchmark (generator / edytor / biblioteka).
2. **Badania porównawcze** — automatyczne serie A–D pod kątem pracy inżynierskiej.

Bezpośredni link do trybu badawczego:

`http://localhost:5173/experiments?mode=research`

### Przykładowa seria

1. Wejdź w **Eksperymenty → Badania porównawcze**.
2. Wybierz badanie A (wpływ liczby wierzchołków).
3. Grupa: najkrótsze ścieżki (Dijkstra vs Bellman–Ford).
4. Topologia: Erdős–Rényi, V = `100, 400, 800, 1000`, powtórzenia 5, seed `12345`.
5. Hipoteza H2 → **Uruchom serię**.
6. Eksportuj CSV/JSON do dokumentacji.

### Ograniczenia wydajnościowe

- V ≤ 10 000, E ≤ 100 000
- Graf pełny ≤ 450 V
- Graf pełny dwudzielny ≤ 600 V
- Bellman–Ford ≤ 1000 V / 25 000 E (kosztowne przypadki są ostrzegane lub pomijane)
