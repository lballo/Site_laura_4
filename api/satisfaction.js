export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "https://lauraballo.com");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const NOTION_API_KEY = process.env.NOTION_API_KEY;
  const DATABASE_ID = "5cc5047eac2641fa94737a0b4c0ecc49";

  if (!NOTION_API_KEY) {
    return res.status(500).json({ error: "Clé API manquante" });
  }

  const { nom, prenom, email, programme, satisfaction, besoin, professionnalisme, disponibilite, remarques } = req.body;

  // Validation champs obligatoires
  if (!nom || !satisfaction) {
    return res.status(400).json({ error: "Champs obligatoires manquants" });
  }

  // Mapping note (1-5) → option Notion
  const noteMap = {
    "1": "⭐ 1",
    "2": "⭐⭐ 2",
    "3": "⭐⭐⭐ 3",
    "4": "⭐⭐⭐⭐ 4",
    "5": "⭐⭐⭐⭐⭐ 5",
  };

  const properties = {
    "Nom": {
      title: [{ text: { content: nom } }]
    },
    "Prénom": {
      rich_text: [{ text: { content: prenom || "" } }]
    },
    "Email": {
      email: email || null
    },
    "Programme suivi": {
      rich_text: [{ text: { content: programme || "" } }]
    },
    "Satisfaction générale": {
      select: { name: noteMap[satisfaction] }
    },
    "Réponse à votre besoin initial": {
      select: { name: noteMap[besoin] }
    },
    "Professionnalisme du coach": {
      select: { name: noteMap[professionnalisme] }
    },
    "Disponibilité du coach": {
      select: { name: noteMap[disponibilite] }
    },
    "Axes d amélioration et remarques": {
      rich_text: [{ text: { content: remarques || "" } }]
    },
    "Statut traitement": {
      select: { name: "Nouveau" }
    }
  };

  try {
    const response = await fetch("https://api.notion.com/v1/pages", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${NOTION_API_KEY}`,
        "Content-Type": "application/json",
        "Notion-Version": "2022-06-28",
      },
      body: JSON.stringify({
        parent: { database_id: DATABASE_ID },
        properties,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error("Notion error:", error);
      return res.status(500).json({ error: "Erreur Notion", detail: error });
    }

    return res.status(200).json({ success: true });

  } catch (err) {
    console.error("Server error:", err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
}
