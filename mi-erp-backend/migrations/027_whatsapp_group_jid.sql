-- Agrega soporte para almacenar el JID real de grupo de WhatsApp (@g.us) en grupos del ERP.
ALTER TABLE grupos_mensajes
    ADD COLUMN IF NOT EXISTS whatsapp_group_jid VARCHAR(120);
