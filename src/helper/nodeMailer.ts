import nodemailer from "nodemailer";
let transporter = nodemailer.createTransport({
    service: "ZeptoMail",
    port: 465,
    host: process.env.SMTP_HOST,
    secure: true, // true for 465, false for other ports
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

export default transporter;
