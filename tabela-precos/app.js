// ===== CONFIGURAÇÃO SUPABASE =====
const SUPABASE_URL = 'https://gphrtytgcbpjpsvsaehj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdwaHJ0eXRnY2JwanBzdnNhZWhqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQyNzUxNTcsImV4cCI6MjA3OTg1MTE1N30.-VTZvuV4xREubHQxArPFRKRhpf_CDYeTHyPntl7-LJI';

// Inicializar cliente Supabase
let supabase = null;
try {
    const { createClient } = window.supabase;
    if (createClient) {
        supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        console.log('✅ Cliente Supabase inicializado com sucesso');
    } else {
        console.warn('⚠️ Biblioteca Supabase não carregada. Usando localStorage.');
    }
} catch (error) {
    console.error('❌ Erro ao inicializar Supabase:', error);
    supabase = null;
}

// Estado da aplicação
let products = [];
let categories = ['Ferramentas', 'Capacitores', 'Cortina de Ar', 'Suportes'];
let editingProductId = null;

const ITEMS_PER_PAGE = 10;
const MAX_IMAGE_SIZE = 2 * 1024 * 1024; // 2MB

// Inicializar (será chamado depois de adicionar os event listeners)

// Função para tratar erros de carregamento de imagem
function handleImageError(imgElement, productCode, imageUrl) {
    console.error(`❌ Erro ao carregar imagem do produto ${productCode}: ${imageUrl}`);
    const container = imgElement.parentElement;
    if (container) {
        container.innerHTML = `<div style="text-align: center; color: #ccc; font-size: 11px; padding: 8px; word-break: break-all;">
            <div style="margin-bottom: 4px;">⚠️ Erro ao carregar</div>
            <div style="font-size: 9px; opacity: 0.6;">${imageUrl.substring(0, 40)}...</div>
        </div>`;
    }
}

// Debug: função para verificar as imagens dos produtos
function debugImages() {
    console.log('=== DEBUG DE IMAGENS ===');
    console.log(`Total de produtos: ${products.length}`);
    products.forEach((p, idx) => {
        console.log(`${idx + 1}. ${p.code} - ${p.description}`);
        console.log(`   Imagem: "${p.image || 'VAZIA'}"`);
        if (p.image) {
            console.log(`   Comprimento: ${p.image.length}`);
            console.log(`   URL válida? ${(p.image.startsWith('http://') || p.image.startsWith('https://')) ? 'SIM ✓' : 'NÃO ✗'}`);
            // Tentar carregar a imagem
            const img = new Image();
            img.onload = () => console.log(`   ✓ Imagem carrega com sucesso!`);
            img.onerror = (e) => console.log(`   ✗ ERRO ao carregar: ${e.type}`);
            img.src = p.image;
            img.crossOrigin = 'anonymous';
        }
    });
}
window.debugImages = debugImages; // Expor no console global
window.handleImageError = handleImageError; // Expor para uso no HTML

// ===== STORAGE COM SUPABASE =====
async function saveToStorage() {
    try {
        console.log('💾 Salvando produtos...');
        console.log('Total de produtos para salvar:', products.length);
        
        // Sempre salvar no localStorage como backup
        localStorage.setItem('gallant_products', JSON.stringify(products));
        localStorage.setItem('gallant_categories', JSON.stringify(categories));
        console.log('✅ Salvos no localStorage');
        
        // Se Supabase não está disponível, só usar localStorage
        if (!supabase) {
            console.warn('⚠️ Supabase não disponível, salvos apenas em localStorage');
            return;
        }
        
        console.log('💾 Tentando salvar no Supabase...');
        
        // Se não há produtos, limpar a tabela
        if (products.length === 0) {
            console.log('ℹ️ Nenhum produto para salvar, limpando tabela...');
            const { error: deleteError } = await supabase.from('products').delete().neq('code', '');
            if (deleteError) {
                console.warn('⚠️ Erro ao limpar:', deleteError.message);
            } else {
                console.log('✅ Tabela limpa');
            }
            return;
        }
        
        // Preparar dados para inserção
        const productsToInsert = products.map(p => ({
            code: p.code,
            description: p.description,
            category: p.category,
            price: parseFloat(p.price),
            image: p.image || null
        }));
        
        console.log(`📝 Preparando ${productsToInsert.length} produtos para inserção...`);
        
        // Estratégia: Deletar todos e reinserir
        console.log('🗑️ Limpando dados antigos...');
        const { error: delError } = await supabase.from('products').delete().neq('code', '');
        if (delError) {
            console.error('⚠️ Erro ao deletar:', delError.message);
        } else {
            console.log('✅ Tabela limpa com sucesso');
        }
        
        // Pequeno delay para garantir deleção
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Inserir novos produtos
        console.log('📤 Inserindo produtos...');
        const { data, error } = await supabase
            .from('products')
            .insert(productsToInsert)
            .select('*');
        
        if (error) {
            console.error('❌ ERRO ao inserir:', error.code, error.message);
            console.error('📋 Detalhes completos:', JSON.stringify(error, null, 2));
            throw error;
        }
        
        if (data) {
            console.log(`✅ ${data.length} produtos salvos no Supabase!`);
            console.log('📊 Primeiros produtos:', data.slice(0, 2));
        }
        
    } catch (error) {
        console.error('❌ ERRO FINAL ao salvar:', error.message || error);
        console.error('Stack:', error.stack);
    }
}

async function loadFromStorage() {
    try {
        console.log('📥 Carregando produtos do Supabase...');
        
        // Se Supabase não está disponível, usar localStorage
        if (!supabase) {
            console.warn('⚠️ Supabase não disponível, usando localStorage');
            const stored = localStorage.getItem('gallant_products');
            if (stored) {
                products = JSON.parse(stored);
                console.log('📥 Produtos carregados do localStorage');
            }
            return;
        }
        
        const { data, error } = await supabase.from('products').select('*');
        
        if (error) {
            console.error('❌ Erro do Supabase:', error.message);
            throw error;
        }
        
        if (data && data.length > 0) {
            products = data.map(p => ({
                id: p.id,
                code: p.code,
                description: p.description,
                category: p.category,
                price: p.price.toString(),
                image: p.image || ''
            }));
            
            // Extrair categorias dos produtos
            const cats = [...new Set(products.map(p => p.category))];
            categories = [...new Set([...categories, ...cats])];
            
            console.log(`✅ ${products.length} produtos carregados do Supabase!`);
        } else {
            console.log('ℹ️ Nenhum produto no Supabase ainda');
            // Tentar carregar do localStorage como fallback
            const stored = localStorage.getItem('gallant_products');
            if (stored) {
                products = JSON.parse(stored);
                console.log('📥 Produtos carregados do localStorage (fallback)');
            }
        }
        
        // Carregar categorias do localStorage
        const storedCategories = localStorage.getItem('gallant_categories');
        if (storedCategories) {
            categories = JSON.parse(storedCategories);
        }
    } catch (error) {
        console.error('❌ Erro ao carregar do Supabase:', error.message || error);
        // Fallback para localStorage
        const stored = localStorage.getItem('gallant_products');
        if (stored) {
            products = JSON.parse(stored);
            console.log('📥 Fallback: Produtos carregados do localStorage');
        }
    }
}

// ===== NAVEGAÇÃO =====
function switchTab(tabName) {
    // Hide all tabs
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // Remove active from all nav items
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Show selected tab
    const tabElement = document.getElementById(tabName);
    if (tabElement) {
        tabElement.classList.add('active');
    }
    
    // Add active to button
    document.querySelector(`[data-tab="${tabName}"]`)?.classList.add('active');
    
    // Update title
    const titles = {
        products: 'Produtos',
        categories: 'Categorias',
        preview: 'Visualizar Catálogo',
        backup: 'Backup'
    };
    const titleElement = document.querySelector('.top-bar-title');
    if (titleElement) {
        titleElement.textContent = titles[tabName] || 'CMS Gallant';
    }
    
    // Update category filter on preview
    if (tabName === 'preview') {
        updateCategoryFilter();
        updatePreview();
    }
}

// ===== PRODUTOS =====
function renderProducts() {
    const container = document.getElementById('productsList');
    
    if (products.length === 0) {
        container.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: #999; padding: 32px;">Nenhum produto ainda. Clique em "➕ Novo" para começar.</p>';
        return;
    }
    
    container.innerHTML = products.map(product => {
        const imageUrl = product.image && product.image.trim() ? product.image.trim() : '';
        console.log('Renderizando produto:', { code: product.code, image: imageUrl, hasImage: !!imageUrl });
        
        return `
        <div class="product-card">
            <div class="product-image" data-product-code="${product.code}">
                ${imageUrl 
                    ? `<img src="${imageUrl}" alt="${product.code}" style="max-height: 100%; max-width: 100%; object-fit: contain;" onerror="handleImageError(this, '${product.code}', '${imageUrl}')" crossorigin="anonymous" referrerpolicy="no-referrer" loading="lazy">`
                    : '<span style="color: #ccc;">Sem imagem</span>'
                }
            </div>
            <div class="product-info">
                <div class="product-category">${product.category || 'Geral'}</div>
                <div class="product-code">${product.code}</div>
                <div class="product-description">${product.description}</div>
                <div class="product-price">R$ ${parseFloat(product.price).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                <div class="product-actions">
                    <button onclick="editProduct('${product.id}')" class="btn btn-primary" style="flex: 1; font-size: 12px;">Editar</button>
                    <button onclick="deleteProduct('${product.id}')" class="btn" style="flex: 1; font-size: 12px; background: #f44336; color: white;">Deletar</button>
                </div>
            </div>
        </div>
    `}).join('');
}

function openProductModal() {
    console.log('openProductModal chamado');
    editingProductId = null;
    
    // Reset modal title
    const modalTitle = document.getElementById('modalTitle');
    if (modalTitle) {
        modalTitle.innerHTML = '<span class="material-icons">add</span>Novo Produto';
    }
    
    // Reset form
    document.getElementById('productCode').value = '';
    document.getElementById('productDescription').value = '';
    document.getElementById('productCategory').value = '';
    document.getElementById('productPrice').value = '';
    document.getElementById('productImage').value = '';
    document.getElementById('imagePreview').classList.add('hidden');
    
    const modal = document.getElementById('productModal');
    console.log('Modal:', modal);
    if (modal) {
        modal.classList.add('active');
    }
}

function closeProductModal() {
    document.getElementById('productModal').classList.remove('active');
    editingProductId = null;
}

function editProduct(id) {
    console.log('Editando produto:', id);
    const product = products.find(p => p.id === id);
    if (!product) {
        console.error('Produto não encontrado:', id);
        return;
    }
    
    editingProductId = id;
    
    const modalTitle = document.getElementById('modalTitle');
    if (modalTitle) {
        modalTitle.innerHTML = '<span class="material-icons">edit</span>Editar Produto';
    }
    
    // Preencher campos
    const codeInput = document.getElementById('productCode');
    const descInput = document.getElementById('productDescription');
    const catSelect = document.getElementById('productCategory');
    const priceInput = document.getElementById('productPrice');
    
    if (codeInput) codeInput.value = product.code;
    if (descInput) descInput.value = product.description;
    if (priceInput) priceInput.value = product.price;
    
    // Garantir que categoria seja setada
    if (catSelect) {
        // Primeiro tentar setar diretamente
        catSelect.value = product.category;
        console.log('Categoria setada para:', product.category, 'Valor atual:', catSelect.value);
        
        // Se não funcionou, procurar pela opção
        if (catSelect.value !== product.category) {
            const option = Array.from(catSelect.options).find(opt => opt.value === product.category);
            if (option) {
                option.selected = true;
                console.log('Categoria selecionada via option');
            }
        }
    }
    
    const imagePreview = document.getElementById('imagePreview');
    const previewImg = document.getElementById('previewImg');
    
    if (product.image) {
        previewImg.src = product.image;
        imagePreview.classList.remove('hidden');
    } else {
        imagePreview.classList.add('hidden');
    }
    
    document.getElementById('productImage').value = '';
    document.getElementById('productModal').classList.add('active');
    console.log('Modal de edição aberto');
}

function deleteProduct(id) {
    if (confirm('Tem certeza que deseja deletar este produto?')) {
        products = products.filter(p => p.id !== id);
        saveToStorage();
        renderProducts();
        updatePreview();
    }
}

function previewImage(event) {
    const file = event.target.files[0];
    
    if (!file) return;
    
    if (file.size > MAX_IMAGE_SIZE) {
        alert('Imagem muito grande! Máximo 2MB.');
        event.target.value = '';
        return;
    }
    
    // Cria URL local para preview (não converte a base64 para não encher localStorage)
    const imageUrl = URL.createObjectURL(file);
    document.getElementById('previewImg').src = imageUrl;
    document.getElementById('previewImg').dataset.fileName = file.name;
    document.getElementById('imagePreview').classList.remove('hidden');
}

function saveProduct() {
    console.log('saveProduct chamado');
    const code = document.getElementById('productCode').value.trim();
    const description = document.getElementById('productDescription').value.trim();
    const category = document.getElementById('productCategory').value;
    const price = document.getElementById('productPrice').value.trim();
    const previewImg = document.getElementById('previewImg');
    const imageUrl = previewImg?.src || '';
    
    console.log('Dados do produto:', { code, description, category, price, imageUrl });
    
    if (!code || !description || !category || !price) {
        alert('Preencha todos os campos obrigatórios!');
        return;
    }
    
    if (editingProductId) {
        // Editar
        const product = products.find(p => p.id === editingProductId);
        product.code = code;
        product.description = description;
        product.category = category;
        product.price = price;
        // Só atualiza imagem se uma nova foi selecionada
        if (imageUrl && imageUrl !== product.image) {
            // Se for URL local (blob), não salva. Mantém a URL anterior
            if (!imageUrl.startsWith('blob:')) {
                product.image = imageUrl;
            }
        }
    } else {
        // Novo produto
        products.push({
            id: Date.now().toString(),
            code,
            description,
            category,
            price,
            image: imageUrl && !imageUrl.startsWith('blob:') ? imageUrl : ''
        });
    }
    
    console.log('Produtos após salvar:', products);
    saveToStorage();
    renderProducts();
    updatePreview();
    closeProductModal();
}

// ===== CATEGORIAS =====
function renderCategories() {
    const container = document.getElementById('categoriesList');
    
    container.innerHTML = categories.map((cat, idx) => `
        <div class="category-item">
            <span>${cat}</span>
            <button onclick="deleteCategory(${idx})" class="category-delete">Deletar</button>
        </div>
    `).join('');
}

function addCategory() {
    const input = document.getElementById('newCategoryInput');
    const name = input.value.trim();
    
    if (!name) {
        alert('Digite o nome da categoria');
        return;
    }
    
    if (categories.includes(name)) {
        alert('Categoria já existe!');
        return;
    }
    
    categories.push(name);
    input.value = '';
    saveToStorage();
    renderCategories();
    updateCategoriesSelect();
    updatePreview();
}

function deleteCategory(idx) {
    if (confirm('Deletar esta categoria? Produtos nela não serão deletados.')) {
        categories.splice(idx, 1);
        saveToStorage();
        renderCategories();
        updateCategoriesSelect();
    }
}

function updateCategoriesSelect() {
    const select = document.getElementById('productCategory');
    if (!select) return; // Se não existir, não faz nada
    
    const currentValue = select.value;
    
    select.innerHTML = '<option value="">Selecione uma categoria</option>' +
        categories.map(cat => `<option value="${cat}">${cat}</option>`).join('');
    
    select.value = currentValue;
}

// ===== PREVIEW & PDF =====
function updateCategoryFilter() {
    const select = document.getElementById('categoryFilter');
    if (!select) return; // Se não existir, não faz nada
    
    const cats = [...new Set(products.map(p => p.category))];
    
    select.innerHTML = '<option value="">Todas as Categorias</option>' +
        cats.map(cat => `<option value="${cat}">${cat}</option>`).join('');
}

function updatePreview() {
    const container = document.getElementById('previewContainer');
    
    if (products.length === 0) {
        container.innerHTML = '<div style="text-align: center; color: #999; padding: 32px;">Nenhum produto para visualizar</div>';
        return;
    }
    
    // Agrupar por categoria
    const grouped = {};
    products.forEach(product => {
        const cat = product.category || 'Geral';
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(product);
    });
    
    let html = '';
    
    Object.entries(grouped).forEach(([category, categoryProducts]) => {
        // Paginar por categoria (máximo 10 produtos por página)
        const pages = [];
        for (let i = 0; i < categoryProducts.length; i += ITEMS_PER_PAGE) {
            pages.push(categoryProducts.slice(i, i + ITEMS_PER_PAGE));
        }
        
        pages.forEach((pageProducts, pageIndex) => {
            html += `
                <div style="width: 297mm; height: 210mm; background: white; padding: 18px; display: flex; flex-direction: column; border: 2px solid #e0e0e0; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); position: relative; page-break-after: always;">
                    <!-- Header com logo -->
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
                        <img src="https://res.cloudinary.com/djoixkakr/image/upload/v1759174088/logoGallant_udaeoi.png" alt="Gallant" style="height: 48px; object-fit: contain;">
                        <div style="text-align: right;">
                            <div style="color: #002F5D; font-size: 9px; font-weight: 600; text-transform: uppercase; margin-bottom: 2px;">Tabela de Vendas</div>
                            <h1 style="color: #002F5D; font-size: 20px; font-weight: 700; text-transform: uppercase; margin: 0; line-height: 1.1;">${category.toUpperCase()}</h1>
                        </div>
                    </div>

                    <!-- Header da tabela -->
                    <div style="display: grid; grid-template-columns: 1fr 1fr 3fr 1fr; gap: 6px; padding: 0 6px 6px 6px; border-bottom: 2px solid #002F5D; margin-bottom: 8px;">
                        <div style="font-weight: 700; color: #002F5D; font-size: 9px; text-align: center; text-transform: uppercase;">Produto</div>
                        <div style="font-weight: 700; color: #002F5D; font-size: 9px; text-align: center; text-transform: uppercase;">Código</div>
                        <div style="font-weight: 700; color: #002F5D; font-size: 9px; text-align: left; text-transform: uppercase;">Descrição</div>
                        <div style="font-weight: 700; color: #002F5D; font-size: 9px; text-align: center; text-transform: uppercase;">Preço</div>
                    </div>

                    <!-- Produtos -->
                    <div style="display: flex; flex-direction: column; gap: 4px;">
                        ${pageProducts.map(product => {
                            // Formatar preço com vírgula
                            const priceFormatted = parseFloat(product.price).toLocaleString('pt-BR', { 
                                minimumFractionDigits: 2, 
                                maximumFractionDigits: 2 
                            });
                            
                            return `
                            <div style="display: grid; grid-template-columns: 1fr 1fr 3fr 1fr; gap: 6px; align-items: center; height: 15.2mm;">
                                <div style="background: #f5f5f5; border: 1px solid #ddd; border-radius: 3px; display: flex; align-items: center; justify-content: center; padding: 3px; overflow: hidden; height: 100%;">
                                    ${product.image 
                                        ? `<img src="${product.image}" alt="${product.code}" style="max-height: 100%; max-width: 100%; object-fit: contain;" crossorigin="anonymous" referrerpolicy="no-referrer" onerror="this.style.display='none'; this.parentElement.innerHTML='<span style=\\\"color: #ccc; font-size: 8px;\\\">Erro</span>'">`
                                        : '<span style="color: #ccc; font-size: 8px;">Sem img</span>'
                                    }
                                </div>
                                <div style="background: #f0f0f0; border: 1px solid #ddd; border-radius: 3px; padding: 3px; text-align: center; font-weight: 700; color: #002F5D; font-size: 9px; height: 100%; display: flex; align-items: center; justify-content: center;">
                                    ${product.code}
                                </div>
                                <div style="background: white; border: 1px solid #ddd; border-radius: 3px; padding: 4px; font-weight: 600; color: #002F5D; font-size: 9px; text-transform: uppercase; height: 100%; display: flex; align-items: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                                    ${product.description}
                                </div>
                                <div style="background: #002F5D; color: white; border: 1px solid #002F5D; border-radius: 3px; padding: 3px; text-align: center; font-weight: 700; font-size: 10px; height: 100%; display: flex; align-items: center; justify-content: center;">
                                    R$ ${priceFormatted}
                                </div>
                            </div>
                        `}).join('')}
                    </div>

                    <!-- Rodapé -->
                    <div style="border-top: 1px solid #ddd; padding-top: 10px; margin-top: 10px; display: flex; justify-content: space-between; align-items: center; font-size: 10px; color: #999;">
                        <span>Documento gerado automaticamente via CMS Gallant</span>
                        <span>Página ${pageIndex + 1}</span>
                    </div>
                </div>
            `;
        });
    });
    
    container.innerHTML = html;
    console.log('Preview atualizado com sucesso');
}

function generatePDF() {
    if (products.length === 0) {
        alert('Adicione produtos antes de gerar PDF!');
        return;
    }
    
    console.log('html2pdf disponível?', typeof html2pdf);
    
    const element = document.getElementById('previewContainer');
    if (!element) {
        alert('Erro: Container de preview não encontrado!');
        return;
    }
    
    // Verificar se html2pdf está carregado
    if (typeof html2pdf === 'undefined') {
        console.error('html2pdf não está carregado! Tentando forma alternativa...');
        
        // Usar impressão do navegador como fallback
        const printWindow = window.open('', '', 'width=1200,height=800');
        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Catálogo Gallant</title>
                <meta charset="UTF-8">
                <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    html, body { width: 100%; height: 100%; }
                    body { 
                        font-family: Arial, sans-serif; 
                        background: #fafafa;
                    }
                    @page {
                        size: A4 landscape;
                        margin: 0;
                        padding: 0;
                    }
                    @media print {
                        body { 
                            margin: 0; 
                            padding: 0; 
                            background: white;
                        }
                        .page-item {
                            page-break-after: always;
                            page-break-inside: avoid;
                            width: 297mm;
                            height: 210mm;
                        }
                        .page-item:last-child {
                            page-break-after: avoid;
                        }
                    }
                    .page-item {
                        margin: 10px auto;
                    }
                </style>
            </head>
            <body>
                ${element.innerHTML.replace(/style="/g, 'old-style="').replace(/old-style="/g, 'style="')}
            </body>
            </html>
        `);
        printWindow.document.close();
        setTimeout(() => {
            printWindow.focus();
            printWindow.print();
        }, 500);
        return;
    }
    
    console.log('Iniciando geração de PDF com html2pdf...');
    
    const opt = {
        margin: 0,
        filename: 'catalogo-gallant.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { format: 'a4', orientation: 'landscape', unit: 'mm' }
    };
    
    try {
        html2pdf().set(opt).from(element).save();
        console.log('PDF gerado com sucesso!');
    } catch (error) {
        console.error('Erro ao gerar PDF:', error);
        alert('Erro ao gerar PDF. Usando visualização para impressão...');
        // Fallback para impressão
        window.print();
    }
}

// ===== EXPORT/IMPORT =====
function downloadJSON() {
    const data = {
        products,
        categories,
        exportDate: new Date().toISOString()
    };
    
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gallant-catalogo-${new Date().getTime()}.json`;
    a.click();
}

function importJSON(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            
            if (!data.products || !Array.isArray(data.products)) {
                throw new Error('Arquivo inválido');
            }
            
            products = data.products;
            categories = data.categories || categories;
            
            saveToStorage();
            renderProducts();
            renderCategories();
            updateCategoriesSelect();
            updatePreview();
            
            alert('Dados importados com sucesso!');
            event.target.value = '';
        } catch (error) {
            alert('Erro ao importar: ' + error.message);
        }
    };
    reader.readAsText(file);
}

function importCSV(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const csv = e.target.result;
            const lines = csv.split('\n');
            
            if (lines.length < 2) {
                throw new Error('Arquivo CSV vazio ou inválido');
            }
            
            // Função para fazer parse de CSV com suporte a aspas
            function parseCSVLine(line) {
                const result = [];
                let current = '';
                let inQuotes = false;
                
                for (let i = 0; i < line.length; i++) {
                    const char = line[i];
                    const nextChar = line[i + 1];
                    
                    if (char === '"') {
                        if (inQuotes && nextChar === '"') {
                            current += '"';
                            i++;
                        } else {
                            inQuotes = !inQuotes;
                        }
                    } else if (char === ',' && !inQuotes) {
                        result.push(current.trim());
                        current = '';
                    } else {
                        current += char;
                    }
                }
                result.push(current.trim());
                return result;
            }
            
            // Parse header
            const headerValues = parseCSVLine(lines[0]);
            const headers = headerValues.map(h => h.toLowerCase().trim());
            
            // LOG DETALHADO DOS HEADERS
            console.log('%c=== ANÁLISE DO ARQUIVO CSV ===', 'color: #002F5D; font-weight: bold; font-size: 14px;');
            console.log('%cColunas encontradas:', 'color: #EBCBC9; font-weight: bold; font-size: 12px;');
            headerValues.forEach((h, i) => {
                console.log(`  [${i}] "${h}"`);
            });
            console.log('%c================================', 'color: #002F5D; font-weight: bold;');
            
            const codeIndex = headers.indexOf('código') >= 0 ? headers.indexOf('código') : headers.indexOf('code');
            const descIndex = headers.indexOf('descrição') >= 0 ? headers.indexOf('descrição') : headers.indexOf('description');
            const catIndex = headers.indexOf('categoria') >= 0 ? headers.indexOf('categoria') : headers.indexOf('category');
            const priceIndex = headers.indexOf('preço') >= 0 ? headers.indexOf('preço') : headers.indexOf('price');
            
            // Procurar por coluna de imagem com vários nomes possíveis
            let imageIndex = -1;
            const possibleImageNames = ['imagem', 'image', 'img', 'url', 'url_imagem', 'url_image', 'foto', 'photo', 'url_foto', 'url da imagem', 'imagem_url'];
            
            // Procura exata primeiro
            for (const name of possibleImageNames) {
                imageIndex = headers.indexOf(name);
                if (imageIndex >= 0) {
                    console.log(`✓ Coluna de imagem encontrada (exata): "${headerValues[imageIndex]}" (índice ${imageIndex})`);
                    break;
                }
            }
            
            // Se não encontrou, procura por contains
            if (imageIndex === -1) {
                for (let i = 0; i < headers.length; i++) {
                    const header = headers[i];
                    if (header.includes('imagem') || header.includes('image') || header.includes('img') || 
                        header.includes('url') || header.includes('foto') || header.includes('photo')) {
                        imageIndex = i;
                        console.log(`✓ Coluna de imagem encontrada (contains): "${headerValues[i]}" (índice ${i})`);
                        break;
                    }
                }
            }
            
            console.log('Headers encontrados:', { codeIndex, descIndex, catIndex, priceIndex, imageIndex });
            console.log('Headers originais:', headerValues);
            console.log('Headers lowercase:', headers);
            if (imageIndex === -1) {
                console.warn('%c⚠️ AVISO: Nenhuma coluna de imagem encontrada!', 'color: #ff9800; font-weight: bold; font-size: 12px;');
                console.warn('%cColunas encontradas no seu CSV:', 'color: #ff9800; font-weight: bold;');
                headerValues.forEach((h, i) => {
                    console.warn(`  [${i}] "${h}"`);
                });
                console.warn('%cRenomeie uma coluna para: "imagem" ou "image" ou "url"', 'color: #ff9800; font-weight: bold;');
            }
            
            if (codeIndex === -1 || descIndex === -1 || catIndex === -1 || priceIndex === -1) {
                throw new Error('Colunas obrigatórias não encontradas: Código, Descrição, Categoria, Preço');
            }
            
            const newProducts = [];
            const newCategories = new Set(categories);
            
            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;
                
                const values = parseCSVLine(line);
                
                const code = values[codeIndex];
                const description = values[descIndex];
                const category = values[catIndex];
                let price = values[priceIndex];
                const image = imageIndex >= 0 && imageIndex < values.length ? values[imageIndex] : '';
                
                console.log(`Linha ${i}: código=${code}, imagem="${image}", imageIndex=${imageIndex}, valuesLength=${values.length}`);
                
                // Limpar preço: remover "R$", espaços e converter vírgula para ponto
                price = price.replace(/R\$/g, '').trim();
                price = price.replace(',', '.');
                price = parseFloat(price).toFixed(2);
                
                // Validar e limpar imagem URL
                let validImage = '';
                if (image && image.trim() && image.toLowerCase() !== 'vazia') {
                    // Remove aspas extras, espaços e caracteres inválidos
                    let cleanImage = image.trim().replace(/^['"]|['"]$/g, '');
                    cleanImage = cleanImage.trim(); // Remove espaços novamente
                    
                    if (cleanImage.startsWith('http://') || cleanImage.startsWith('https://')) {
                        validImage = cleanImage;
                        console.log(`  ✓ Imagem válida para ${code}: ${validImage}`);
                    } else {
                        console.warn(`  ✗ URL inválida para ${code}: ${cleanImage}`);
                    }
                } else {
                    console.log(`  ⚪ Sem imagem para ${code}`);
                }
                
                if (code && description && category && price && price !== 'NaN') {
                    newProducts.push({
                        id: Date.now().toString() + Math.random(),
                        code,
                        description,
                        category,
                        price,
                        image: validImage
                    });
                    
                    newCategories.add(category);
                }
            }
            
            if (newProducts.length === 0) {
                throw new Error('Nenhum produto válido encontrado no arquivo');
            }
            
            // Debug: mostrar primeiros 3 produtos com suas imagens
            console.log('=== PRIMEIROS PRODUTOS IMPORTADOS ===');
            newProducts.slice(0, 3).forEach(p => {
                console.log(`${p.code}: "${p.image}"`);
            });
            
            // Contar quantos têm imagem
            const withImage = newProducts.filter(p => p.image).length;
            console.log(`📊 Total: ${newProducts.length} | Com imagem: ${withImage} | Sem imagem: ${newProducts.length - withImage}`);
            
            // Perguntar se quer adicionar ou substituir
            const shouldReplace = confirm(`Encontrados ${newProducts.length} produtos.\n\n"OK" para ADICIONAR aos existentes\n"Cancelar" para SUBSTITUIR todos`);
            
            if (shouldReplace) {
                products = products.concat(newProducts);
                categories = Array.from(new Set([...categories, ...newCategories]));
            } else {
                products = newProducts;
                categories = Array.from(newCategories);
            }
            
            saveToStorage();
            renderProducts();
            renderCategories();
            updateCategoriesSelect();
            updatePreview();
            switchTab('products');
            
            alert(`✅ ${newProducts.length} produtos importados com sucesso!`);
            event.target.value = '';
        } catch (error) {
            alert('Erro ao importar CSV: ' + error.message);
            console.error('Erro:', error);
        }
    };
    reader.readAsText(file);
}

function exportData() {
    downloadJSON();
}

function clearAllData() {
    if (confirm('⚠️ CUIDADO! Isto vai deletar TODOS os produtos e categorias. Tem certeza?')) {
        if (confirm('Clique OK novamente para confirmar')) {
            products = [];
            categories = ['Ferramentas', 'Capacitores', 'Cortina de Ar', 'Suportes'];
            localStorage.clear();
            location.reload();
        }
    }
}

// ===== EVENT LISTENERS (Material UI) =====
document.addEventListener('DOMContentLoaded', async () => {
    console.log('DOMContentLoaded disparado');
    
    // INICIALIZAR DADOS
    await loadFromStorage();
    updateCategoriesSelect();
    renderProducts();
    renderCategories();
    updatePreview();
    
    console.log('Dados carregados. Produtos:', products, 'Categorias:', categories);
    
    // Botão Novo Produto
    const addProductBtn = document.getElementById('addProductBtn');
    if (addProductBtn) {
        addProductBtn.addEventListener('click', openProductModal);
    }
    
    // Fechar modal (X)
    const closeModalBtn = document.getElementById('closeModalBtn');
    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', closeProductModal);
    }
    
    // Cancelar modal
    const cancelModalBtn = document.getElementById('cancelModalBtn');
    if (cancelModalBtn) {
        cancelModalBtn.addEventListener('click', closeProductModal);
    }
    
    // Fechar modal ao clicar fora
    const productModal = document.getElementById('productModal');
    if (productModal) {
        productModal.addEventListener('click', (e) => {
            if (e.target === productModal) {
                closeProductModal();
            }
        });
    }
    
    // Form submit
    const productForm = document.getElementById('productForm');
    if (productForm) {
        productForm.addEventListener('submit', (e) => {
            e.preventDefault();
            saveProduct();
        });
    }
    
    // Preview de imagem
    const productImage = document.getElementById('productImage');
    if (productImage) {
        productImage.addEventListener('change', previewImage);
    }
    
    // Adicionar categoria
    const addCategoryBtn = document.getElementById('addCategoryBtn');
    if (addCategoryBtn) {
        addCategoryBtn.addEventListener('click', addCategory);
    }
    
    // Gerar PDF
    const generatePdfBtn = document.getElementById('generatePdfBtn');
    if (generatePdfBtn) {
        generatePdfBtn.addEventListener('click', () => {
            console.log('Botão Gerar PDF clicado');
            if (products.length === 0) {
                alert('Adicione produtos antes de gerar o PDF!');
                return;
            }
            updatePreview();
            setTimeout(() => generatePDF(), 100);
        });
    }
    
    // Backup
    const downloadBackupBtn = document.getElementById('downloadBackupBtn');
    if (downloadBackupBtn) {
        downloadBackupBtn.addEventListener('click', downloadJSON);
    }
    
    const importBackupBtn = document.getElementById('importBackupBtn');
    const importBackupInput = document.getElementById('importBackupInput');
    if (importBackupBtn && importBackupInput) {
        importBackupBtn.addEventListener('click', () => importJSON({ target: importBackupInput }));
        importBackupInput.addEventListener('change', importJSON);
    }
    
    // Importar CSV
    const importCsvBtn = document.getElementById('importCsvBtn');
    const importCsvInput = document.getElementById('importCsvInput');
    if (importCsvBtn && importCsvInput) {
        importCsvBtn.addEventListener('click', () => importCsvInput.click());
        importCsvInput.addEventListener('change', (e) => importCSV(e));
    }
    
    // Enter em novo categoria
    const newCategoryInput = document.getElementById('newCategoryInput');
    if (newCategoryInput) {
        newCategoryInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                addCategory();
            }
        });
    }
    
    // Botões de navegação
    document.querySelectorAll('[data-tab]').forEach(btn => {
        btn.addEventListener('click', () => {
            const tabName = btn.getAttribute('data-tab');
            switchTab(tabName);
        });
    });
});
