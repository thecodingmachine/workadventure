import {CLIENT_ID, CLIENT_SECRET} from "../Enum/EnvironmentVariable";

const googleapis = require('googleapis');

const { google } = googleapis;

export const auth = new google.auth.OAuth2(
    CLIENT_ID,
    CLIENT_SECRET,
    'http://localhost/jwt',
);