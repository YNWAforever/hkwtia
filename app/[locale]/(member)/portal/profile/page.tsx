import {PortalForm, PortalInput, PortalSubmit} from "@/components/portal/forms/portal-form";
import {portalFormLabels} from "@/lib/portal/form-state";
import {getTranslations, setRequestLocale} from "next-intl/server";

import {StatusLabel} from "@/components/wt/status-label";
import type {AppLocale} from "@/i18n/routing";
import {portalPageActor} from "@/lib/portal/page-actor";
import {getSelfProfile} from "@/lib/portal/self-profile";
import {updateProfileAction} from "@/lib/portal/commands";

export const dynamic = "force-dynamic";

type Props = Readonly<{params: Promise<{locale: string}>}>;

export default async function ProfilePage({params}: Props) {
  const {locale: localeValue} = await params;
  const locale = localeValue as AppLocale;
  setRequestLocale(locale);
  const actor = await portalPageActor(locale, "/portal/profile");
  const profile = await getSelfProfile(actor);
  const t = await getTranslations({locale, namespace: "Portal"});

  return (
    <div>
      {/* The dashboard's heading scale and label; the description rides the lead line. */}
      <header className="portal-welcome">
        <StatusLabel as="p">{t("profile")}</StatusLabel>
        <h1>{t("profileTitle")}</h1>
        <p className="portal-welcome-lead">{t("profileDescription")}</p>
      </header>
      <PortalForm action={updateProfileAction} labels={portalFormLabels(t)}>
        <fieldset className="portal-fieldset">
          <legend className="portal-fieldset-title">{t("profileGroups.contact")}</legend>
          <div className="portal-field">
            <label htmlFor="profile-displayName">{t("fields.displayName")}</label>
            <PortalInput defaultValue={profile.displayName} id="profile-displayName" name="displayName" required />
          </div>
          <div className="portal-pair">
            <div className="portal-field">
              <label htmlFor="profile-jobTitle">{t("fields.jobTitle")}</label>
              <PortalInput defaultValue={profile.jobTitle ?? ""} id="profile-jobTitle" name="jobTitle" />
            </div>
            <div className="portal-field">
              <label htmlFor="profile-phone">{t("fields.phone")}</label>
              <PortalInput defaultValue={profile.phone ?? ""} id="profile-phone" name="phone" type="tel" />
            </div>
          </div>
        </fieldset>
        <fieldset className="portal-fieldset">
          <legend className="portal-fieldset-title">{t("profileGroups.whatsapp")}</legend>
          <div className="portal-field">
            <label htmlFor="profile-whatsappNumber">{t("fields.whatsappNumber")}</label>
            <PortalInput defaultValue={profile.whatsappNumber ?? ""} id="profile-whatsappNumber" name="whatsappNumber" type="tel" />
          </div>
          <div className="portal-field portal-consent">
            <StatusLabel as="p">{profile.whatsappOptIn ? t("whatsapp.status.on") : t("whatsapp.status.off")}</StatusLabel>
            <label className="portal-consent-row">
              <PortalInput aria-describedby="profile-whatsapp-consent" defaultChecked={profile.whatsappOptIn} name="whatsappOptIn" type="checkbox" />
              <span>{t("whatsapp.optIn")}</span>
            </label>
            <p className="portal-field-help" id="profile-whatsapp-consent">{t("whatsapp.consent")}</p>
          </div>
        </fieldset>
        <PortalInput name="locale" type="hidden" value={locale} />
        <div className="portal-field portal-consent">
          <label className="portal-consent-row">
            <PortalInput aria-describedby="profile-directory-help" defaultChecked={profile.directoryVisible} name="directoryVisible" type="checkbox" />
            <span>{t("fields.directoryVisible")}</span>
          </label>
          <p className="portal-field-help" id="profile-directory-help">{t("profileGroups.directoryHelp")}</p>
        </div>
        <div className="portal-form-actions">
          <PortalSubmit />
        </div>
      </PortalForm>
    </div>
  );
}
