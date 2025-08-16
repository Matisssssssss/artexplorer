(function() {
    const NarrativeStyles = {
        ANALYSE_EXPERTE: 'analyse_experte',
        ANECDOTE_AMUSANTE: 'anecdote_amusante',
        DESCRIPTION_COURTE: 'description_courte',
        POUR_ENFANTS: 'pour_enfants'
    };

    const NarrativeStyleLabels = {
        [NarrativeStyles.ANALYSE_EXPERTE]: 'Analyse experte',
        [NarrativeStyles.ANECDOTE_AMUSANTE]: 'Anecdote amusante',
        [NarrativeStyles.DESCRIPTION_COURTE]: 'Description courte',
        [NarrativeStyles.POUR_ENFANTS]: 'Pour enfants'
    };

    function estimateReadingTimeMinutes(text) {
        if (!text) return 0;
        const words = text.trim().split(/\s+/).length;
        const minutes = words / 200;
        return Math.max(1, Math.round(minutes));
    }

    function buildPromptForStyle(styleKey, artwork, options = {}) {
        const title = artwork.title || 'l\'œuvre';
        const artist = artwork.artist || '';
        const lengthHint = options.length === 'short' ? 'Privilégie une version courte et percutante.' : 'Tu peux développer les points clés.';

        const dArtdArtCore = [
            'Raconte l\'histoire de ' + title + (artist ? ' de ' + artist : '') + ' dans le style de l\'émission D\'art d\'Art :',
            'Commence par une anecdote inattendue ou humoristique.',
            'Mélange culture et humour avec un ton décalé.',
            'Privilégie les petites histoires et les détails croustillants.',
            'Rends l\'art accessible sans être condescendant.',
            'Utilise des phrases courtes et percutantes.',
            'Termine par une chute surprenante ou un détail méconnu.',
            'Adopte un style ludique qui donne envie d\'en savoir plus.'
        ].join('\n');

        const vulgarisation = [
            'Ton rédactionnel : mélange professionnel et décalé, informatif et humoristique.',
            'Structure narrative : pyramide inversée, commence par l\'info la plus captivante.',
            'Approche pédagogique : facilite l\'accès, suscite l\'intérêt, propose un point de départ.'
        ].join('\n');

        let styleSpecific = '';
        switch (styleKey) {
            case NarrativeStyles.ANALYSE_EXPERTE:
                styleSpecific = 'Inclure techniques, contexte historique et vocabulaire précis, sans jargon inutile.\n' + lengthHint;
                break;
            case NarrativeStyles.ANECDOTE_AMUSANTE:
                styleSpecific = 'Accent sur les anecdotes mémorables, fun facts, petites histoires.\n' + lengthHint;
                break;
            case NarrativeStyles.DESCRIPTION_COURTE:
                styleSpecific = 'Résumé clair et accessible en quelques phrases, concret et direct.\n' + lengthHint;
                break;
            case NarrativeStyles.POUR_ENFANTS:
                styleSpecific = 'Adresse-toi à des enfants (8-12 ans), phrases simples, analogies concrètes, ton bienveillant et ludique.\n' + lengthHint;
                break;
            default:
                styleSpecific = lengthHint;
        }

        const example = `Exemple de transformation :\n` +
            `Prompt original : "Décrivez ${title}${artist ? ' de ' + artist : ''}"\n` +
            `Prompt style D\'art d\'Art : "Raconte l\'histoire de ${title}${artist ? ' de ' + artist : ''} comme dans l\'émission D\'art d\'Art : commence par un fait marquant, révèle un détail technique accessible, glisse une anecdote croustillante, et termine par une chute surprenante. Adopte un ton décalé et humoristique, avec des phrases courtes."`;

        return [
            dArtdArtCore,
            '',
            'Principes de vulgarisation :',
            vulgarisation,
            '',
            'Contraintes de style spécifiques :',
            styleSpecific,
            '',
            example
        ].join('\n');
    }

    function pickStyleByPreferences(artwork, preferences) {
        const available = artwork.contents ? Object.keys(artwork.contents) : [];
        const hasAudio = (style) => artwork.contents && artwork.contents[style] && artwork.contents[style].audioUrl;

        const preferred = preferences.preferredNarrativeStyle || null;
        const groupType = preferences.groupType || 'Adulte';
        const wantsAudio = (preferences.accessPreference || 'Texte') === 'Audio';
        const shortVisit = (preferences.duration || 90) <= 60;

        let candidateOrder = [];

        if (groupType === 'Enfants') candidateOrder.push(NarrativeStyles.POUR_ENFANTS);
        if (preferred) candidateOrder.unshift(preferred);
        if (shortVisit) candidateOrder.push(NarrativeStyles.DESCRIPTION_COURTE);
        candidateOrder.push(NarrativeStyles.ANECDOTE_AMUSANTE);
        candidateOrder.push(NarrativeStyles.ANALYSE_EXPERTE);

        // Deduplicate while preserving order
        candidateOrder = candidateOrder.filter((v, i, a) => v && a.indexOf(v) === i);

        // If audio is wanted, prefer styles that have audio available
        if (wantsAudio) {
            const audioFirst = candidateOrder.filter(s => available.includes(s) && hasAudio(s));
            const rest = candidateOrder.filter(s => !audioFirst.includes(s));
            candidateOrder = audioFirst.concat(rest);
        }

        for (const s of candidateOrder) {
            if (available.includes(s)) return s;
        }

        return available[0] || NarrativeStyles.DESCRIPTION_COURTE;
    }

    function selectContentForArtwork(artwork, preferences = {}) {
        const selectedStyle = pickStyleByPreferences(artwork, preferences);
        const content = (artwork.contents && artwork.contents[selectedStyle]) || null;

        if (content && content.text) {
            return {
                styleKey: selectedStyle,
                styleLabel: NarrativeStyleLabels[selectedStyle] || selectedStyle,
                text: content.text,
                audioUrl: content.audioUrl || null,
                readingMinutes: estimateReadingTimeMinutes(content.text),
                prompt: null
            };
        }

        const length = (preferences.duration || 90) <= 60 ? 'short' : 'long';
        const prompt = buildPromptForStyle(selectedStyle, artwork, { length });
        const placeholder = 'Contenu à générer via IA. Base de prompt:\n\n' + prompt;

        return {
            styleKey: selectedStyle,
            styleLabel: NarrativeStyleLabels[selectedStyle] || selectedStyle,
            text: placeholder,
            audioUrl: null,
            readingMinutes: estimateReadingTimeMinutes(placeholder),
            prompt
        };
    }

    function cycleStyle(currentStyle) {
        const order = [
            NarrativeStyles.ANECDOTE_AMUSANTE,
            NarrativeStyles.DESCRIPTION_COURTE,
            NarrativeStyles.ANALYSE_EXPERTE,
            NarrativeStyles.POUR_ENFANTS
        ];
        const idx = order.indexOf(currentStyle);
        return order[(idx + 1) % order.length];
    }

    function regenerateContentVariant(artwork, preferences = {}, feedback = {}) {
        let style = preferences.preferredNarrativeStyle || null;
        if (feedback.rating && feedback.rating <= 3) {
            style = NarrativeStyles.DESCRIPTION_COURTE;
        } else if (feedback.rating && feedback.rating >= 5) {
            style = NarrativeStyles.ANALYSE_EXPERTE;
        }
        if (!style) {
            const picked = pickStyleByPreferences(artwork, preferences);
            style = cycleStyle(picked);
        }
        const nextPrefs = Object.assign({}, preferences, { preferredNarrativeStyle: style });
        return selectContentForArtwork(artwork, nextPrefs);
    }

    const BackOfficeContentManager = {
        createOrUpdateContent(artwork, styleKey, payload) {
            if (!artwork.contents) artwork.contents = {};
            artwork.contents[styleKey] = {
                text: payload.text || '',
                audioUrl: payload.audioUrl || null
            };
            return artwork.contents[styleKey];
        },
        removeContent(artwork, styleKey) {
            if (artwork.contents && artwork.contents[styleKey]) {
                delete artwork.contents[styleKey];
            }
        },
        listStyles(artwork) {
            return artwork.contents ? Object.keys(artwork.contents) : [];
        }
    };

    window.NarrativeStyles = NarrativeStyles;
    window.NarrativeStyleLabels = NarrativeStyleLabels;
    window.AIEngineV2 = {
        estimateReadingTimeMinutes,
        buildPromptForStyle,
        selectContentForArtwork,
        regenerateContentVariant
    };
    window.BackOfficeContentManager = BackOfficeContentManager;
})();