# Km-Log App

Online kilometerregistratie — de getrouwe, veilige opvolger van de kilometerteller-werkmap
(`KILOMETER TELLER _2026.xlsx`). Gebouwd per de specificatie *Km-Logger WebApp — Functionele &
Technische Specificatie* als **Next.js (React) + Prisma** webapp.

## Stack
- Presentatie: Next.js App Router (client) — Login & registratie, Admin-beheer, Maandraster JAN–DEC, mobiele invoer
- API & autorisatie: Next.js Route Handlers (`/api/...`) + HTTP-only sessiecookie (HMAC) + argon2id
- Domeinservices: kalenderengine (2024–2060), rit-state machine (carry-forward), aggregatie & limieten, OCR-scanverwerking (Tesseract.js)
- Datalaag: Prisma (SQLite voor lokaal dev, PostgreSQL/SQLite op Render met schijf)

## Visuele identiteit (Excelgetrouw)
- Koppen maandraster: charcoal `#3A3A3A`, witte vette tekst
- Sjabloon-/adminkoppen: bruin `#663300`
- Jaarkiezer: cyaan `#00B0F0` (JAAR SELECT, bijna cursief-vet)
- Weekendrijen (za/zo): zwarte vulling, witte tekst
- Datumformaat `mm-dd-yy`, gecentreerd
- Achtergronden: `odometer.jpg` (jaaroverzicht), `spoorweg.jpg` (maandpagina's), `logo.png`, `fox.png`
- Onder 768 px: kaartenlijst per dag (zelfde velden, volgorde en kleuren)

## Rollen & flows
- **Eerste registratie ooit = admin** (direct actief). Alle volgende gebruikers:
  registratie → PENDING → admin goedkeurt → ACTIVE.
- **Wachtwoord vergeten**: aanvraag PENDING → admin keurt goed → 6-cijferige code (30 min) →
 code blijft bij het inlog → nieuw wachtwoord → direct ingelogd.
- **Admin-reset**: vaste herstelcode uit `ADMIN_RECOVERY_CODE` (omgeving), met auditwaarschuwing in de serverlog.
- **Account verwijderen**: self-service met typbevestiging; cascade wist alles.

## De km-engine (server-side)
1. `buildCalendar(year)` — schrikkeljaar-gewaar, NL weekdagen, weekendvlag
2. `resolveEndDate` — nachtrit (D/N = N) geeft einddatum = startdatum + 1 dag
3. `resolveState` / carry-forward — state 1/2/3, precies één state per rij, meerdaagse ritten
   worden afgeketend tegen de openingsstand
4. `yearSummary` — TOT LIMIET (resterend budget) of OVER LIMIET → TEBETALEN = overschrijding × EUR/km
5. `checkYearClose` — jaar afsluiten: reconciliatie sluit- versus openingsstand

Standaarden uit `user_settings`: km-limiet **14.000**, tarief **0,175 EUR/km**.

## Lokaal draaien
```bash
npm install
npx prisma db push
npm run dev        # http://localhost:3000
```

## Testgeval uit de JANUARI-sheet
gebruiker `jan`, jaar 2026, openingsstand **39.504**, rit 19 januari:
D, start 39.504, eind 39.574 → dagtotaal 70, privé 10 →
jaartotaal 70, privé 10, VERSCHIL 13.990 → **TOT LIMIET, resteert 13.990 km**. ✔

## Deployment (Render)
1. Repo op GitHub zetten en `render.yaml` controleren.
2. In Render: **New → Blueprint** → repo kiezen → service aanmaken.
3. **Persistent disk** aan de service hangen (bij gratis plan is SQLite niet persistent;
   eventueel het PostgreSQL-dialect kiezen).
4. Eerste registratie: dit wordt het admin-account.
   Eindwachtwoord admin volgens opdracht: `Km-Admin-pass/01`.
