// Disposable / throwaway email domains refused for free API keys. Not
// exhaustive (new ones appear weekly); extend as abuse shows up. Matching is on
// the registrable domain and its subdomains.
const DISPOSABLE = new Set([
  '10minutemail.com', '10minutemail.net', '10minemail.com', '20minutemail.com', '33mail.com', 'anonaddy.com', 'anonbox.net',
  'binkmail.com', 'bobmail.info', 'burnermail.io', 'byom.de', 'chammy.info', 'crazymailing.com', 'deadaddress.com', 'despam.it',
  'discard.email', 'dispostable.com', 'dropmail.me', 'emailondeck.com', 'emailtemporario.com.br', 'ethereal.email', 'fakeinbox.com',
  'fakemail.net', 'fakemailgenerator.com', 'filzmail.com', 'getairmail.com', 'getnada.com', 'guerrillamail.com', 'guerrillamail.net',
  'guerrillamail.org', 'guerrillamail.biz', 'guerrillamail.de', 'guerrillamailblock.com', 'harakirimail.com', 'inboxalias.com',
  'inboxbear.com', 'inboxkitten.com', 'incognitomail.com', 'instantemailaddress.com', 'jetable.org', 'kasmail.com', 'koszmail.pl',
  'kurzepost.de', 'lroid.com', 'mail-temp.com', 'mail.tm', 'mail7.io', 'mailcatch.com', 'maildrop.cc', 'maildu.de', 'mailexpire.com',
  'mailforspam.com', 'mailhazard.com', 'mailimate.com', 'mailinator.com', 'mailinator.net', 'mailinator2.com', 'mailme.lv',
  'mailmoat.com', 'mailnesia.com', 'mailnull.com', 'mailpoof.com', 'mailsac.com', 'mailtemp.info', 'mailtothis.com', 'mailzilla.com',
  'meltmail.com', 'mintemail.com', 'moakt.com', 'mohmal.com', 'mt2015.com', 'mytemp.email', 'mytrashmail.com', 'nomail.xl.cx',
  'nowmymail.com', 'nwytg.net', 'objectmail.com', 'onewaymail.com', 'owlpic.com', 'pokemail.net', 'proxymail.eu', 'rcpt.at',
  'rhyta.com', 'safetymail.info', 'sharklasers.com', 'shitmail.me', 'spam4.me', 'spamavert.com', 'spambog.com', 'spambox.us',
  'spamdecoy.net', 'spamfree24.org', 'spamgourmet.com', 'spamherelots.com', 'spamhole.com', 'spaml.com', 'spammotel.com',
  'spamspot.com', 'spamthisplease.com', 'superrito.com', 'tafmail.com', 'teleworm.us', 'temp-mail.org', 'temp-mail.io', 'temp-mail.ru',
  'tempail.com', 'tempemail.co', 'tempemail.net', 'tempinbox.com', 'tempmail.com', 'tempmail.de', 'tempmail.net', 'tempmail.plus',
  'tempmailaddress.com', 'tempmailo.com', 'tempr.email', 'temporaryemail.net', 'temporaryinbox.com', 'thankyou2010.com',
  'throwam.com', 'throwawaymail.com', 'tmail.ws', 'tmails.net', 'tmpmail.net', 'tmpmail.org', 'trash-mail.com', 'trash-mail.de',
  'trashmail.com', 'trashmail.de', 'trashmail.me', 'trashmail.net', 'trashymail.com', 'trbvm.com', 'tyldd.com', 'vomoto.com',
  'wegwerfmail.de', 'wegwerfmail.net', 'wh4f.org', 'yopmail.com', 'yopmail.fr', 'yopmail.net', 'zetmail.com', 'zippymail.info',
  'mailinator.org', 'getonemail.com', 'emailfake.com', 'generator.email', 'fakemailgenerator.net', 'tempm.com', 'mailtemp.net',
  'luxusmail.org', 'cuvox.de', 'dayrep.com', 'einrot.com', 'fleckens.hu', 'gustr.com', 'jourrapide.com', 'armyspy.com',
]);

/** True when the email's domain (or a parent of it) is a known disposable provider. */
export function isDisposableEmail(email: string): boolean {
  const at = email.lastIndexOf('@');
  if (at < 0) return false;
  const domain = email.slice(at + 1).toLowerCase().trim();
  const parts = domain.split('.');
  for (let i = 0; i < parts.length - 1; i++) {
    if (DISPOSABLE.has(parts.slice(i).join('.'))) return true;
  }
  return false;
}
