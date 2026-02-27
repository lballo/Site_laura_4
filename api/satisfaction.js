export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "https://lauraballo.com");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const NOTION_API_KEY = process.env.NOTION_API_KEY;
  const DATABASE_ID = "5cc5047eac2641fa94737a0b4c0ecc49";
  const CRM_DATABASE_ID = "127075e127d28112b16dde7180b01a42";

  if (!NOTION_API_KEY) return res.status(500).json({ error: "Clé API manquante" });

  const { clientId, prenom, programme, satisfaction, besoin, professionnalisme, disponibilite, remarques } = req.body;

  if (!satisfaction) return res.status(400).json({ error: "Champs obligatoires manquants" });

  const titre = prenom
    ? `${prenom} — ${programme || "Programme"}`
    : programme || "Réponse sans nom";

  const properties = {
    "Nom": { title: [{ text: { content: titre } }] },
    "Programme suivi": { rich_text: [{ text: { content: programme || "" } }] },
    "Satisfaction générale": { number: parseInt(satisfaction) },
    "Réponse à votre besoin initial": { number: parseInt(besoin) },
    "Professionnalisme du coach": { number: parseInt(professionnalisme) },
    "Disponibilité du coach": { number: parseInt(disponibilite) },
    "Axes d amélioration et remarques": { rich_text: [{ text: { content: remarques || "" } }] },
    "Statut traitement": { select: { name: "Nouveau" } },
  };

  // Relier automatiquement au client CRM si l'ID est fourni
  if (clientId) {
    properties["Client lié"] = {
      relation: [{ id: clientId }]
    };
  }

  try {
    // 1. Créer la réponse dans Réponses Satisfaction
    const response = await fetch("https://api.notion.com/v1/pages", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${NOTION_API_KEY}`,
        "Content-Type": "application/json",
        "Notion-Version": "2022-06-28",
      },
      body: JSON.stringify({ parent: { database_id: DATABASE_ID }, properties }),
    });

    if (!response.ok) {
      const error = await response.json();
      return res.status(500).json({ error: "Erreur Notion", detail: error });
    }

    // 2. Cocher "Feedback réalisé ✅" dans le CRM People
    if (clientId) {
      await fetch(`https://api.notion.com/v1/pages/${clientId}`, {
        method: "PATCH",
        headers: {
          "Authorization": `Bearer ${NOTION_API_KEY}`,
          "Content-Type": "application/json",
          "Notion-Version": "2022-06-28",
        },
        body: JSON.stringify({
          properties: { "Feedback réalisé? ": { checkbox: true } }
        }),
      });
    }

    return res.status(200).json({ success: true });

  } catch (err) {
    console.error("Server error:", err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
}

