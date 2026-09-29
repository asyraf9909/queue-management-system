export type QueueSettings = {
  brandName: string;
  schoolName: string;
  branchName: string;
  logoUrl: string;
  displayLogoUrl: string;
  primaryColor: string;
  accentColor: string;
  displayBackgroundColor: string;
  welcomeTitle: string;
  welcomeSubtitle: string;
  kioskWaitingMessage: string;
  kioskFootnote: string;
  kioskWelcomeLabel: string;
  kioskYourNumberLabel: string;
  kioskGetNumberLabel: string;
  kioskTakeAnotherLabel: string;
  kioskPrintLabel: string;
  displayNowServingLabel: string;
  displayNextLabel: string;
  displayFooterMessage: string;
  displayProceedLabel: string;
  displayVoiceTemplate: string;
  displayVoiceEnabledLabel: string;
  displayVoiceDisabledLabel: string;
  helpTitle: string;
  helpSubtitle: string;
  supportEmail: string;
  queuePrefix: string;
  maxQueueNumber: number;
  displayNextCount: number;
  voiceEnabled: boolean;
  soundEnabled: boolean;
};

export const defaultSettings: QueueSettings = {
  brandName: "Queuewise",
  schoolName: "Axis Driving School",
  branchName: "Downtown branch",
  logoUrl: "",
  displayLogoUrl: "",
  primaryColor: "#263c4b",
  accentColor: "#e67b58",
  displayBackgroundColor: "#1c3438",
  welcomeTitle: "Take your place in the queue.",
  welcomeSubtitle: "Tap below to receive a number and we’ll let you know when it’s your turn.",
  kioskWaitingMessage: "Please take a seat. We’ll call you shortly.",
  kioskFootnote: "No appointment? No problem.",
  kioskWelcomeLabel: "WELCOME IN",
  kioskYourNumberLabel: "YOUR QUEUE NUMBER",
  kioskGetNumberLabel: "Get a number",
  kioskTakeAnotherLabel: "Take another number",
  kioskPrintLabel: "Print ticket",
  displayNowServingLabel: "NOW SERVING",
  displayNextLabel: "UP NEXT",
  displayFooterMessage: "Please wait for your number",
  displayProceedLabel: "Please proceed to",
  displayVoiceTemplate: "Number {number}, please proceed to Counter {counter}.",
  displayVoiceEnabledLabel: "Voice announcements enabled",
  displayVoiceDisabledLabel: "Voice announcements disabled",
  helpTitle: "Need a hand?",
  helpSubtitle: "Open help center",
  supportEmail: "support@example.com",
  queuePrefix: "A",
  maxQueueNumber: 999,
  displayNextCount: 4,
  voiceEnabled: true,
  soundEnabled: true,
};

export const settingsStorageKey = "queuewise-settings";
