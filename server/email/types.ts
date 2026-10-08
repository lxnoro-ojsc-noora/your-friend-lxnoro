export interface BookingConfirmationEmail {
  to: { name: string; email: string };
  subject: string;
  text: string;
  messageId: string;
}

export interface BookingConfirmationMailer {
  sendConfirmation(email: BookingConfirmationEmail): Promise<void>;
}
