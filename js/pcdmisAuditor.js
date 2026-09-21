/* PC-DMIS Routine & Vector Logic Auditor
   Pattern-based, line-oriented scanner for common PC-DMIS native program text.
   Not a full DMIS-standard parser - tolerant of formatting/version variance. */

function auditRoutine(rawText) {
  const lines = rawText.split(/\r?\n/);
  const findings = [];
  const addFinding = (severity, category, lineNum, message, snippet) => {
    findings.push({ severity, category, line: lineNum, message, snippet: (snippet || '').trim().slice(0, 160) });
  };

  // --- Pass 1: Alignment block DOF tracking ---
  let inAlignment = false;
  let alignStartLine = -1;
  let constrained = { Tx: false, Ty: false, Tz: false, Rx: false, Ry: false, Rz: false };
  let datumFeaturesUsed = [];
  let alignmentBlocksFound = 0;
  let hasLevel = false, hasRotate = false, hasOrigin = false;

  const resetAlignState = () => {
    constrained = { Tx: false, Ty: false, Tz: false, Rx: false, Ry: false, Rz: false };
    datumFeaturesUsed = [];
    hasLevel = false; hasRotate = false; hasOrigin = false;
  };

  lines.forEach((line, idx) => {
    const lineNum = idx + 1;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("'")) return; // PC-DMIS comment lines often start with '

    // PC-DMIS often prefixes a statement with a label, e.g. "STARTUP =ALIGNMENT/START,...".
    // Strip an optional "LABEL=" prefix before matching ALIGNMENT/ commands so labeled
    // statements are recognized the same as unlabeled ones.
    const alignLine = trimmed.replace(/^[A-Za-z_]\w*\s*=\s*(?=ALIGNMENT\s*\/)/i, '');

    // Alignment block boundaries
    let mStart;
    if ((mStart = /^ALIGNMENT\s*\/\s*START\b(?:.*?RECALL\s*:\s*([\w-]+))?/i.exec(alignLine))) {
      inAlignment = true;
      alignStartLine = lineNum;
      resetAlignState();
      alignmentBlocksFound++;
      const recalledName = mStart[1];
      if (recalledName && recalledName.toUpperCase() !== 'NONE') {
        // Recalling a previously stored, named alignment pulls in a full, presumably
        // already-validated 3-2-1 scheme - it doesn't need inline LEVEL/ROTATE/ORIGIN steps.
        constrained = { Tx: true, Ty: true, Tz: true, Rx: true, Ry: true, Rz: true };
        hasLevel = true; hasRotate = true; hasOrigin = true;
      }
      return;
    }
    if (/^ALIGNMENT\s*\/\s*END/i.test(alignLine)) {
      if (inAlignment) {
        // Evaluate DOF coverage at end of this alignment block
        const free = Object.entries(constrained).filter(([k, v]) => !v).map(([k]) => k);
        if (free.length > 0) {
          addFinding('high', 'Unconstrained DOF',
            lineNum,
            `Alignment block (start line ${alignStartLine}) ends with ${free.length} unconstrained degree(s) of freedom: ${free.join(', ')}. A full 3-2-1 alignment should lock all 6 DOF (Tx,Ty,Tz,Rx,Ry,Rz).`,
            trimmed);
        }
        if (!hasLevel) {
          addFinding('high', 'Unstable 3-2-1 Alignment', alignStartLine,
            'No ALIGNMENT/LEVEL step found - primary datum plane (rotation lock) may be missing.', trimmed);
        }
        if (!hasRotate) {
          addFinding('medium', 'Unstable 3-2-1 Alignment', alignStartLine,
            'No ALIGNMENT/ROTATE step found - secondary datum (clocking/rotation about remaining axis) may be missing.', trimmed);
        }
        if (!hasOrigin) {
          addFinding('medium', 'Unstable 3-2-1 Alignment', alignStartLine,
            'No ALIGNMENT/ORIGIN step found - tertiary datum / origin translation may be missing.', trimmed);
        }
        // Duplicate datum feature reuse across steps
        const counts = {};
        datumFeaturesUsed.forEach(f => { counts[f] = (counts[f] || 0) + 1; });
        Object.entries(counts).forEach(([feat, count]) => {
          if (count > 1) {
            addFinding('medium', 'Datum Reuse', alignStartLine,
              `Datum feature "${feat}" is referenced ${count} times across alignment steps in this block. Reusing the same feature for multiple constraint steps can produce an unstable or non-independent 3-2-1 scheme.`,
              trimmed);
          }
        });
      }
      inAlignment = false;
      return;
    }

    if (!inAlignment) return;

    // LEVEL: constrains 2 rotations (the two axes perpendicular to leveled axis)
    let m;
    if ((m = /^ALIGNMENT\s*\/\s*LEVEL\s*,\s*([XYZ]PLUS|[XYZ]MINUS)\s*,\s*([\w()]+)/i.exec(alignLine))) {
      hasLevel = true;
      const axis = m[1][0].toUpperCase();
      datumFeaturesUsed.push(m[2]);
      if (axis === 'Z') { constrained.Rx = true; constrained.Ry = true; }
      else if (axis === 'X') { constrained.Ry = true; constrained.Rz = true; }
      else if (axis === 'Y') { constrained.Rx = true; constrained.Rz = true; }
      return;
    }
    if ((m = /^ALIGNMENT\s*\/\s*ROTATE\s*,\s*([XYZ]AXIS)\s*,\s*([XYZ]PLUS|[XYZ]MINUS)\s*,\s*([\w()]+)(?:\s*,\s*([\w()]+))?/i.exec(alignLine))) {
      hasRotate = true;
      const rotAxis = m[1][0].toUpperCase();
      datumFeaturesUsed.push(m[3]);
      if (m[4]) datumFeaturesUsed.push(m[4]);
      if (rotAxis === 'X') constrained.Rx = true;
      else if (rotAxis === 'Y') constrained.Ry = true;
      else if (rotAxis === 'Z') constrained.Rz = true;
      return;
    }
    if ((m = /^ALIGNMENT\s*\/\s*ORIGIN\s*,\s*(.+)/i.exec(alignLine))) {
      hasOrigin = true;
      const body = m[1];
      if (/\bX\b/i.test(body)) constrained.Tx = true;
      if (/\bY\b/i.test(body)) constrained.Ty = true;
      if (/\bZ\b/i.test(body)) constrained.Tz = true;
      const featMatches = body.match(/[A-Za-z_][\w]*\(\w+\)|[A-Za-z_]\w*\d*/g) || [];
      datumFeaturesUsed.push(...featMatches.filter(f => !/^[XYZ]$/i.test(f)));
      return;
    }
    if (/^ALIGNMENT\s*\/\s*RECALL/i.test(alignLine)) {
      // Recalling a saved alignment satisfies all DOF - treat as fully constrained
      constrained = { Tx: true, Ty: true, Tz: true, Rx: true, Ry: true, Rz: true };
      hasLevel = true; hasRotate = true; hasOrigin = true;
      return;
    }
  });

  if (inAlignment) {
    addFinding('high', 'Unstable 3-2-1 Alignment', alignStartLine,
      'ALIGNMENT/START block was never closed with ALIGNMENT/END - routine may be truncated or malformed.', '');
  }

  // --- Pass 2: Vector sanity within MEAS/HIT feature blocks ---
  let inMeas = false;
  let measStartLine = -1;
  let measFeatureName = '';
  let hitVectors = [];

  const evaluateMeasBlock = () => {
    if (hitVectors.length < 2) return;
    // Unit-length check
    hitVectors.forEach(hv => {
      const mag = Math.sqrt(hv.i * hv.i + hv.j * hv.j + hv.k * hv.k);
      if (mag > 0 && Math.abs(mag - 1) > 0.05) {
        addFinding('medium', 'Vector Integrity', hv.line,
          `HIT vector magnitude is ${mag.toFixed(3)} (expected ~1.0 for a unit normal). Possible corrupted or non-normalized vector.`,
          hv.raw);
      }
    });
    // Flip detection: dot product between consecutive vectors on the same feature
    for (let i = 1; i < hitVectors.length; i++) {
      const a = hitVectors[i - 1], b = hitVectors[i];
      const magA = Math.sqrt(a.i * a.i + a.j * a.j + a.k * a.k);
      const magB = Math.sqrt(b.i * b.i + b.j * b.j + b.k * b.k);
      if (magA === 0 || magB === 0) continue;
      const dot = (a.i * b.i + a.j * b.j + a.k * b.k) / (magA * magB);
      if (dot < -0.3) {
        addFinding('high', 'Vector Flip', b.line,
          `Hit point vector on feature "${measFeatureName}" points ${Math.round(Math.acos(Math.max(-1, Math.min(1, dot))) * 180 / Math.PI)}° away from the previous hit's vector. This is consistent with a flipped surface normal / probe compensation direction error.`,
          b.raw);
      }
    }
  };

  lines.forEach((line, idx) => {
    const lineNum = idx + 1;
    const trimmed = line.trim();
    let m;
    if ((m = /^([A-Za-z_]\w*)\s*=\s*MEAS\s*\/\s*(\w+)\s*,\s*F\(([^)]*)\)/i.exec(trimmed)) ||
        (m = /^MEAS\s*\/\s*(\w+)\s*,\s*F\(([^)]*)\)/i.exec(trimmed))) {
      inMeas = true;
      measStartLine = lineNum;
      measFeatureName = m[1] || 'unnamed';
      hitVectors = [];
      return;
    }
    if (/^ENDMEAS/i.test(trimmed)) {
      if (inMeas) evaluateMeasBlock();
      inMeas = false;
      return;
    }
    if (inMeas && (m = /^HIT\s*\/\s*(?:BASIC|POINT)?,?\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)/i.exec(trimmed))) {
      hitVectors.push({
        x: parseFloat(m[1]), y: parseFloat(m[2]), z: parseFloat(m[3]),
        i: parseFloat(m[4]), j: parseFloat(m[5]), k: parseFloat(m[6]),
        line: lineNum, raw: trimmed,
      });
    }
  });
  if (inMeas) evaluateMeasBlock();

  // --- Pass 3: DEPEND/VAR self-reference & general code smells ---
  lines.forEach((line, idx) => {
    const lineNum = idx + 1;
    const trimmed = line.trim();
    let m;
    if ((m = /^([A-Za-z_]\w*)\s*=\s*DEPEND\s*\/\s*VAR\s*,\s*(.+)/i.exec(trimmed))) {
      const varName = m[1];
      const expr = m[2];
      const re = new RegExp('\\b' + varName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b');
      if (re.test(expr)) {
        addFinding('high', 'Data Calculation', lineNum,
          `Variable "${varName}" appears to reference itself in its own DEPEND/VAR expression - likely to cause a circular/incorrect calculation.`,
          trimmed);
      }
      if (/\/\s*0(?!\d)/.test(expr)) {
        addFinding('high', 'Data Calculation', lineNum,
          `Expression for "${varName}" appears to divide by a literal 0.`, trimmed);
      }
    }
    if (/\b(TEMP|TEMPORARY|DEBUG|IGNORE\s*THIS|DELETE\s*ME|DO\s*NOT\s*USE|FIXME)\b/i.test(trimmed) && trimmed.startsWith("'")) {
      addFinding('low', 'Housekeeping', lineNum,
        'Comment flags this section as temporary/debug/do-not-use - confirm it was not left in by mistake before release.',
        trimmed);
    }
    if (/^TOL\s*\/.*,\s*,/.test(trimmed)) {
      addFinding('low', 'Tolerance Setup', lineNum,
        'TOL/ statement appears to have an empty parameter field - verify tolerance values were entered correctly.', trimmed);
    }
  });

  if (alignmentBlocksFound === 0) {
    addFinding('medium', 'Unstable 3-2-1 Alignment', 1,
      'No ALIGNMENT/START block was found in the pasted text. If this is a full routine, part-to-CMM alignment may be missing or defined elsewhere (e.g. RECALL of an external alignment).', '');
  }

  // --- Scoring ---
  const weights = { high: 15, medium: 7, low: 2 };
  let deduction = 0;
  findings.forEach(f => { deduction += weights[f.severity] || 2; });
  const score = Math.max(0, Math.round(100 - deduction));

  const severityOrder = { high: 0, medium: 1, low: 2 };
  findings.sort((a, b) => (severityOrder[a.severity] - severityOrder[b.severity]) || (a.line - b.line));

  let rating = 'Excellent';
  if (score < 50) rating = 'High Risk';
  else if (score < 70) rating = 'Needs Attention';
  else if (score < 90) rating = 'Good';

  return {
    score,
    rating,
    findings,
    stats: {
      totalLines: lines.length,
      alignmentBlocks: alignmentBlocksFound,
      highCount: findings.filter(f => f.severity === 'high').length,
      mediumCount: findings.filter(f => f.severity === 'medium').length,
      lowCount: findings.filter(f => f.severity === 'low').length,
    },
  };
}

window.PCDMISAuditor = { auditRoutine };
