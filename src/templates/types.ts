// src/templates/types.ts

export interface TemplateInput {
    /** Header text displayed prominently at the top. */
    header?: string;
    /** Main body text. */
    body: string;
    /** Call-to-action button. */
    callToAction?: {
        label: string;
        url: string;
    };
    /** Footer text at the bottom. */
    footer?: string;
    /** Branding name shown in the template. Falls back to DEFAULT_SENDER_NAME env. */
    brandName?: string;
}

export interface TemplateOutput {
    /** Rendered HTML email body. */
    html: string;
    /** Rendered plain-text email body. */
    text: string;
}
