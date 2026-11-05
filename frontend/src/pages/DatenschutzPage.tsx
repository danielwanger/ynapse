export default function DatenschutzPage() {
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "2rem 1rem", lineHeight: 1.6 }}>
      <h1>Datenschutzerklärung</h1>

      <h2>1. Verantwortlicher</h2>
      <p>
        Daniel Wanger, Erhartstraße 30, 85053 Ingolstadt,
        E-Mail: danielwanger.dw@gmail.com
      </p>

      <h2>2. Allgemeines</h2>
      <p>
        Ynapse verwendet keine Benutzerkonten, keine Cookies zu Tracking- oder
        Werbezwecken und keine Analyse-Dienste. Personenbezogene Daten werden nur
        verarbeitet, soweit dies für den technischen Betrieb der Seite nötig ist.
      </p>

      <h2>3. Hosting und Server-Logfiles</h2>
      <p>
        Beim Aufruf der Seite verarbeiten die eingesetzten Dienstleister technisch
        notwendige Daten, insbesondere die IP-Adresse, Datum und Uhrzeit des
        Abrufs, die angefragte URL und den User-Agent. Rechtsgrundlage ist
        Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse am sicheren und
        stabilen Betrieb). Die Server-Logs auf unserem eigenen Server werden
        automatisch rotiert; ältere Einträge werden fortlaufend überschrieben
        (maximal 30 MB je Dienst). Für die Logs der übrigen Dienstleister gelten
        deren eigene Aufbewahrungsfristen.
      </p>
      <p>Eingesetzte Dienstleister (Auftragsverarbeiter):</p>
      <ul>
        <li>
          Netlify (Auslieferung der Website, Frontend) – Netlify, Inc., USA.
          Mit Netlify besteht ein Vertrag zur Auftragsverarbeitung (Data Processing
          Agreement), der Bestandteil der Nutzungsbedingungen ist. Netlify ist unter
          dem EU-US Data Privacy Framework zertifiziert; die Übermittlung stützt sich
          auf den Angemessenheitsbeschluss der EU-Kommission (Art. 45 DSGVO).
        </li>
        <li>
          Hetzner Online GmbH (Server des Backends, Rechenzentrum in Deutschland)
        </li>
        <li>
          Cloudflare (Cloudflare Tunnel: Weiterleitung des Datenverkehrs zum
          Backend) – Cloudflare, Inc., USA.
          Cloudflare ist unter dem EU-US Data Privacy Framework zertifiziert; die Übermittlung stützt sich auf den Angemessenheitsbeschluss der EU-Kommission (Art. 45 DSGVO). Ergänzend gelten die Standardvertragsklauseln der EU-Kommission.
        </li>
        <li>Supabase (Datenbank) – Region: Frankfurt, Deutschland (eu-central-1)</li>
      </ul>

      <h2>4. Suchanfragen</h2>
      <p>
        Eingegebene Suchanfragen werden an unser Backend gesendet, um
        Suchergebnisse zu berechnen. Technisch bedingt erscheinen die
        Suchbegriffe kurzzeitig in den Server-Logs; diese enthalten keine
        IP-Adresse der Besucher und werden mit der Log-Rotation überschrieben.
        Eine darüber hinausgehende Speicherung der Suchanfragen findet nicht statt.
      </p>

      <h2>5. Externe Links</h2>
      <p>
        Ynapse verlinkt auf Artikel externer Nachrichtenquellen. Beim Anklicken
        verlassen Sie unsere Seite; für die dortige Datenverarbeitung sind die
        jeweiligen Betreiber verantwortlich.
      </p>

      <h2>6. Ihre Rechte</h2>
      <p>
        Sie haben das Recht auf Auskunft (Art. 15 DSGVO), Berichtigung (Art. 16),
        Löschung (Art. 17), Einschränkung der Verarbeitung (Art. 18),
        Datenübertragbarkeit (Art. 20) und Widerspruch (Art. 21). Zudem können Sie
        sich bei einer Datenschutzaufsichtsbehörde beschweren, in Bayern beim
        Bayerischen Landesamt für Datenschutzaufsicht (BayLDA).
      </p>

      <p>Stand: 6. November 2026</p>
    </main>
  );
}